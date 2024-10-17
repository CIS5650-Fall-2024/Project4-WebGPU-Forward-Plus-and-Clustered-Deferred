import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    forwardPlusPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);
        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here

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
                    resource: { buffer: this.lights.clusterBuffer }
                }
            ]
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
                    code: shaders.forwardPlusFragSrc
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
        this.lights.doLightClustering(encoder);
    
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
