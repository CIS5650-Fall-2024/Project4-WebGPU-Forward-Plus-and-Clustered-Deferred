import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    // Help from https://webgpu.github.io/webgpu-samples/?sample=deferredRendering

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    positionTexture: GPUTexture;
    positionTextureView: GPUTextureView;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;

    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    GBufferPipeline: GPURenderPipeline;
    DeferredFullScreenPipeline: GPURenderPipeline;

    GBufferRenderPassDescriptor: GPURenderPassDescriptor;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        
        // Make textures for G-buffer
        this.positionTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.positionTextureView = this.positionTexture.createView();
        
        this.albedoTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "bgra8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.albedoTextureView = this.albedoTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTextureView = this.normalTexture.createView();

        // Depth texture
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // Camera Uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
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
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
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
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                }
            ]
        });

        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer bind group layout",
            entries: [
                { // Albedo
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                { // Position
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                { // Normal
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                }
            ]
        });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "G-buffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.positionTextureView
                },
                {
                    binding: 1,
                    resource: this.albedoTextureView
                },
                {
                    binding: 2,
                    resource: this.normalTextureView
                }
            ]
        });

        this.GBufferPipeline = renderer.device.createRenderPipeline({
            label: "G-buffer pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "G-buffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    code: shaders.naiveVertSrc,
                    label: "G-buffer vertex shader"
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteredDeferredFragSrc,
                    label: "G-buffer fragment shader"
                }),
                targets: [
                    { // position
                        format: "rgba16float"
                    },
                    { // albedo
                        format: "bgra8unorm"
                    },
                    { // normal
                        format: "rgba16float"
                    }
                ]
            }
        });

        this.DeferredFullScreenPipeline = renderer.device.createRenderPipeline({
            label: "Deferred Fullscreen pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "Deferred Fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferBindGroupLayout
                ]
            }),
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: false,
                depthCompare: "less"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteredDeferredFullscreenVertSrc,
                    label: "Deferred Fullscreen vertex shader"
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                    label: "Deferred Fullscreen fragment shader"
                }),
                targets: [
                    {
                        format: renderer.canvasFormat
                    }
                ]
            }
        });

        this.GBufferRenderPassDescriptor = {
                label: "Deferred Fullscreen render pass",
                colorAttachments: [
                    { // Position
                        view: this.positionTextureView,
                        clearValue: [0, 0, 0, 0],
                        storeOp: "store",
                        loadOp: "clear"
                    },
                    { // Albedo
                        view: this.albedoTextureView,
                        clearValue: [0, 0, 0, 0],
                        storeOp: "store",
                        loadOp: "clear"
                    },
                    { // Normal
                        view: this.normalTextureView,
                        clearValue: [0, 0, 0, 0],
                        storeOp: "store",
                        loadOp: "clear"
                    }
                ],
                depthStencilAttachment: {
                    view: this.depthTextureView,
                    depthClearValue: 1.0,
                    depthStoreOp: "store",
                    depthLoadOp: "clear"
                }
            };
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations

        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // Run Light Clustering Compute Pass
        this.lights.doLightClustering(encoder);

        // G-buffer pass
        const GBufferPass = encoder.beginRenderPass(this.GBufferRenderPassDescriptor);

        GBufferPass.setPipeline(this.GBufferPipeline);
        GBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate (node => {
            GBufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            GBufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            GBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            GBufferPass.setIndexBuffer(primitive.indexBuffer, "uint32");
            GBufferPass.drawIndexed(primitive.numIndices);
        });

        GBufferPass.end();

        // Fullscreen pass

        const FullscreenPassDescriptor: GPURenderPassDescriptor = {
            label: "Deferred Fullscreen render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "load",
                depthStoreOp: "store"
            }
        };

        const FullscreenPass = encoder.beginRenderPass(FullscreenPassDescriptor);

        FullscreenPass.setPipeline(this.DeferredFullScreenPipeline);
        FullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        FullscreenPass.setBindGroup(shaders.constants.bindGroup_framebuffer, this.gBufferBindGroup);
        FullscreenPass.draw(6);

        FullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
