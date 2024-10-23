import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class NaiveRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    pipeline: GPURenderPipeline;

    perf: boolean = false;
    perfQuerySet: GPUQuerySet;
    perfQueryResults: GPUBuffer;
    perfQueryResolve: GPUBuffer;
    perfLastNFrameTimes: number[] = [];

    constructor(stage: Stage) {
        super(stage);

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                // TODO-1.2: add an entry for camera uniforms at binding 0, visible to only the vertex shader, and of type "uniform"
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                // TODO-1.2: add an entry for camera uniforms at binding 0
                // you can access the camera using `this.camera`
                // if you run into TypeScript errors, you're probably trying to upload the host buffer instead
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer } // reference to the camera's GPU buffer
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: {width: renderer.canvas.width, height: renderer.canvas.height},
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "naive pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
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
                    label: "naive vertex shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "naive fragment shader",
                    code: shaders.naiveFragSrc,
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
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const renderPass = encoder.beginRenderPass({
            label: "naive render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
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

        renderPass.setPipeline(this.pipeline);

        // TODO-1.2: bind `this.sceneUniformsBindGroup` to index `shaders.constants.bindGroup_scene`
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

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
