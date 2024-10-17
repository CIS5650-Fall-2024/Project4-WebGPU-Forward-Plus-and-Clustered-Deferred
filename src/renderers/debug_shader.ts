import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class DebugShaderRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    clusterComputeBindGroupLayout: GPUBindGroupLayout;
    clusterComputeBindGroup: GPUBindGroup;
    clusterComputePipeline: GPUComputePipeline;
    clusterBuffer: GPUBuffer;

    forwardPlusPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);
        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here

        const numClustersX = 16; 
        const numClustersY = 9;
        const numClustersZ = 24;
        const maxLightsPerCluster = 256;
        const clusterSize = 
            3 * 4 + // minBounds (vec3<f32>)
            3 * 4 + // maxBounds (vec3<f32>)
            4 +     // lightCount (u32)
            maxLightsPerCluster * 4; // lightIndices (array<u32, 256>)
        const clusterSetSize = 
            3 * 4 + // numClustersX, numClustersY, numClustersZ (3 * u32)
            numClustersX * numClustersY * numClustersZ * clusterSize; // clusters array
        const clusterSetInitData = new Uint32Array([
            numClustersX,
            numClustersY,
            numClustersZ,
        ]);
        this.clusterBuffer = renderer.device.createBuffer({
            size: clusterSetSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(
            this.clusterBuffer,
            0, 
            clusterSetInitData
        );

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                {
                  binding: 2,
                  visibility: GPUShaderStage.FRAGMENT,
                  buffer: { type: "read-only-storage" }
                }
            ]
        });
        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            layout: this.sceneUniformsBindGroupLayout,
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
                    resource: { buffer: this.clusterBuffer }
                }
            ]
        });

        this.clusterComputeBindGroupLayout = renderer.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" } 
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" } 
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });
        this.clusterComputeBindGroup = renderer.device.createBindGroup({
            layout: this.clusterComputeBindGroupLayout,
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
                    resource: { buffer: this.clusterBuffer }
                }
            ]
        });

        this.clusterComputePipeline = renderer.device.createComputePipeline({
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [this.clusterComputeBindGroupLayout]
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteringDebugComputeSrc
                }),
                entryPoint: "main"
            }
        });

        this.forwardPlusPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    code: shaders.naiveVertSrc 
                }),
                entryPoint: "main",
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    code: shaders.forwardPlusDebugFragSrc
                }),
                entryPoint: "main",
                targets: [{ format: renderer.canvasFormat }]
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            }
        });

    }

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        const encoder = renderer.device.createCommandEncoder();
    
        // - run the clustering compute shader
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.clusterComputePipeline);
        computePass.setBindGroup(0, this.clusterComputeBindGroup);
        computePass.dispatchWorkgroups(
            Math.ceil(16 / 8), // numClustersX / workgroupSizeX
            Math.ceil(9 / 8),  // numClustersY / workgroupSizeY
            24                 // numClustersZ
        );
        computePass.end();
    
        // - run the main rendering pass, using the computed clusters for efficient lighting
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: renderer.context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 } //Alpha zero?
            }],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
    
        renderPass.setPipeline(this.forwardPlusPipeline);
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
    
        renderPass.end();
        renderer.device.queue.submit([encoder.finish()]);
    }
}
