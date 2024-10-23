import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    forwardPlusPipeline: GPURenderPipeline;
    forwardPlusBindGroupLayout: GPUBindGroupLayout;
    forwardPlusBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    perf: boolean = false;
    perfQuerySet: GPUQuerySet;
    perfQueryResults: GPUBuffer;
    perfQueryResolve: GPUBuffer;
    perfLastNFrameTimes: number[] = [];

    debug: boolean = false;

    constructor(stage: Stage) {
        super(stage);

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here

        this.depthTexture = renderer.device.createTexture({
            size: {width: renderer.canvas.width, height: renderer.canvas.height},
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.forwardPlusBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "forward+ bind group layout",
            entries: [
                {
                    // Camera.
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    // Lights.
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { 
                    // Clusters.
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { 
                    // Cluster grid.  
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.forwardPlusBindGroup = renderer.device.createBindGroup({
            label: "forward+ bind group",
            layout: this.forwardPlusBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.getClusterBuffer() }
                },
                {
                    binding: 3,
                    resource: { buffer: this.lights.getClusterGridBuffer() }
                }
            ]
        });

        this.forwardPlusPipeline = renderer.device.createRenderPipeline({
            label: "forward+ render pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "forward+ pipeline layout",
                bindGroupLayouts: [
                    this.forwardPlusBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "forward+ vertex shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward+ fragment shader",
                    code: shaders.forwardPlusFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });

        if (this.perf) {
            this.perfQuerySet = renderer.device.createQuerySet({
                type: 'timestamp',
                count: 2,
            });

            this.perfQueryResults = renderer.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.QUERY_RESOLVE,
            });

            this.perfQueryResolve = renderer.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
        }
    }

    override async draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting

        const encoder = renderer.device.createCommandEncoder({label: "forward+ draw command encoder"});
    
        this.lights.doLightClustering(encoder, this.perf ? null : null);

        const renderPass = encoder.beginRenderPass({
            label: "forward+ render pass",
            colorAttachments: [
                {
                    view: renderer.context.getCurrentTexture().createView(),
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        if (this.perf) renderPass.writeTimestamp(this.perfQuerySet, 0);
 
        renderPass.setPipeline(this.forwardPlusPipeline);
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.forwardPlusBindGroup);
 
        this.scene.iterate(node => {
            renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            renderPass.setVertexBuffer(0, primitive.vertexBuffer);
            renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            renderPass.drawIndexed(primitive.numIndices);
        });

        if (this.perf) renderPass.writeTimestamp(this.perfQuerySet, 1);
 
        renderPass.end();
        renderer.device.queue.submit([encoder.finish()]);

        if (this.debug) {
            await renderer.device.queue.onSubmittedWorkDone();
            await this.lights.readClusterBuffer();
        }

        if (this.perf) {
            const perfQueryEncoder = renderer.device.createCommandEncoder();
            perfQueryEncoder.resolveQuerySet(this.perfQuerySet, 0, 2, this.perfQueryResults, 0);
            const resolveCommandBuffer = perfQueryEncoder.finish();
            renderer.device.queue.submit([resolveCommandBuffer]);

            const copyEncoder = renderer.device.createCommandEncoder();
            copyEncoder.copyBufferToBuffer(this.perfQueryResults, 0, this.perfQueryResolve, 0, 16);
            const copyCommandBuffer = copyEncoder.finish();
            renderer.device.queue.submit([copyCommandBuffer]);

            await this.perfQueryResolve.mapAsync(GPUMapMode.READ);
            const arrayBuffer = this.perfQueryResolve.getMappedRange();
            const timestamps = new BigUint64Array(arrayBuffer);
            const startTime = timestamps[0];
            const endTime = timestamps[1];
            const frameTimeMs = Number(endTime - startTime) / 1e6;
            this.perfLastNFrameTimes.push(frameTimeMs);
            if (this.perfLastNFrameTimes.length == 100)
                console.log(`Average pass execution time: ${this.perfLastNFrameTimes.reduce((a, b) => a + b, 0)/100} ms`);
            this.perfQueryResolve.unmap();
        }
    }
}
