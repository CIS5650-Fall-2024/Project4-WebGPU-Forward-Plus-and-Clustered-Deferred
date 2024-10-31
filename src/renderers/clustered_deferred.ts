import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    GBufferSceneUniformsBindGroupLayout: GPUBindGroupLayout;
    GBufferSceneUniformsBindGroup: GPUBindGroup;

    finalPassSceneUniformsBindGroupLayout: GPUBindGroupLayout;
    finalPassSceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    GBufferTexture: GPUTexture;
    GBufferTextureView: GPUTextureView;

    GBufferPipeline: GPURenderPipeline;
    finalPassPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        this.GBufferSceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "gbuffer scene uniforms bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.GBufferSceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "gbuffer scene uniforms bind group",
            layout: this.GBufferSceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                }
            ]
        });

        this.GBufferTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32uint",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.GBufferTextureView = this.GBufferTexture.createView();

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        this.finalPassSceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "final pass scene uniforms bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // g buffer tex
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { 
                        sampleType: "uint",
                        viewDimension: "2d"
                     }
                },
                { // depth stencil
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "depth",
                        viewDimension: "2d"
                    }
                }
            ]
        });

        this.finalPassSceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "final pass scene uniforms bind group",
            layout: this.finalPassSceneUniformsBindGroupLayout,
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
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                },
                {
                    binding: 3,
                    resource: this.GBufferTextureView
                },
                {
                    binding: 4,
                    resource: this.depthTextureView
                }
            ]
        });
    
        this.GBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "gbuffer pipeline layout",
                bindGroupLayouts: [
                    this.GBufferSceneUniformsBindGroupLayout,
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
                    label: "gbuffer vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: "rgba32uint"
                    }
                ]
            }
        });

        this.finalPassPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "final pass pipeline layout",
                bindGroupLayouts: [
                    this.finalPassSceneUniformsBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "final pass vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "final pass clustered deferred frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat
                    }
                ]
            }
        });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        const encoder = renderer.device.createCommandEncoder();

        // - run the clustering compute shader
        this.lights.doLightClustering(encoder);

        // - run the G-buffer pass, outputting position, albedo, and normals
        const GBufferRenderPass = encoder.beginRenderPass({
            label: "gbuffer render pass",
            colorAttachments: [
                {
                    view: this.GBufferTextureView,
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
        GBufferRenderPass.setPipeline(this.GBufferPipeline);

        GBufferRenderPass.setBindGroup(shaders.constants.bindGroup_scene, this.GBufferSceneUniformsBindGroup);

        this.scene.iterate(node => {
            GBufferRenderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            GBufferRenderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            GBufferRenderPass.setVertexBuffer(0, primitive.vertexBuffer);
            GBufferRenderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            GBufferRenderPass.drawIndexed(primitive.numIndices);
        });

        GBufferRenderPass.end();

        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const finalRenderPass = encoder.beginRenderPass({
            label: "final render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });

        finalRenderPass.setPipeline(this.finalPassPipeline);

        finalRenderPass.setBindGroup(shaders.constants.bindGroup_scene, this.finalPassSceneUniformsBindGroup);
        finalRenderPass.draw(6);

        finalRenderPass.end();

        renderer.device.queue.submit([encoder.finish()]);

    }
}
