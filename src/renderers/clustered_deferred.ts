import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {

    sceneUniformsBindGroupLayout : GPUBindGroupLayout; 
    sceneUniformsBindGroup : GPUBindGroup; 

    gBufferBindGroupLayout : GPUBindGroupLayout; 
    gBufferBindGroup : GPUBindGroup; 

    // depth buffer
    depthTexture : GPUTexture; 
    depthTextureView : GPUTextureView; 

    // position buffer
    positionTexture : GPUTexture; 
    positionTextureView : GPUTextureView;

    // albedo buffer
    albedoTexture : GPUTexture; 
    albedoTextureView : GPUTextureView;

    // normal buffer
    normalTexture : GPUTexture; 
    normalTextureView : GPUTextureView;

    GBufferPipeline : GPURenderPipeline; 
    FullScreenPipeline : GPURenderPipeline; 

    GBufferRenderPassDescriptor : GPURenderPassDescriptor; 

    constructor(stage: Stage) {
        super(stage);

        // Create textures / texture views for deferred rendering

        // depth buffer
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthTextureView = this.depthTexture.createView();

        // position buffer
        this.positionTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.positionTextureView = this.positionTexture.createView();

        // albedo buffer (only needs to be standard 0-255 color channels)
        this.albedoTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "bgra8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.albedoTextureView = this.albedoTexture.createView();

        // normal buffer
        this.normalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.normalTextureView = this.normalTexture.createView();

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "deferred uniforms bind group layout",
            entries: [
                { // camera uniforms
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
            label: "deferred uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsGPUBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterSet.clusterSetStorageBuffer }
                }
            ]
        });

        // Lets create a bindgroup just for the G-buffer textures

        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "gbuffer bind group layout",
            entries: [
                {   // position
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'unfilterable-float',
                    }
                },
                {   // normal
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'unfilterable-float',
                    }
                },
                {   // albedo
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'unfilterable-float',
                    }
                }
            ]
        }); 

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "gbuffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.positionTextureView
                },
                {
                    binding: 1,
                    resource: this.normalTextureView
                },
                {
                    binding: 2,
                    resource: this.albedoTextureView
                }
            ]
        }); 

        // G-buffer pipeline
        this.GBufferPipeline = renderer.device.createRenderPipeline({
            label: "Gbuffer pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "forward pipeline layout",
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
                    label: "deferred vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {   // position
                        format: this.positionTexture.format 
                    },
                    {   // normal
                        format: this.normalTexture.format
                    },
                    {   // albedo
                        format: this.albedoTexture.format
                    }
                ]
            }
        });

        // full screen pipeline
        this.FullScreenPipeline = renderer.device.createRenderPipeline({
            label: "Fullscreen pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "forward pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {   // position
                        format: renderer.canvasFormat 
                    }
                ]
            }
        }); 

        // init gbuffer render pass descriptors

        this.GBufferRenderPassDescriptor = {
            label: "gbuffer render pass",
            colorAttachments: [
                {
                    view: this.positionTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.normalTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.albedoTextureView,
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
        }; 

        
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder(); 
        const canvasTextureView = renderer.context.getCurrentTexture().createView(); 

        // - run the clustering compute shader
        this.lights.doLightClustering(encoder); 

        // - run the G-buffer pass, outputting position, albedo, and normals
        {
            const renderPass = encoder.beginRenderPass(this.GBufferRenderPassDescriptor); 
            
            renderPass.setPipeline(this.GBufferPipeline); 
            renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup); 

            // render scene
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
        }

        {
            const fullScreenRenderPassDescriptor : GPURenderPassDescriptor = {
                label: "fullscreen render pass",
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
            }; 

            const renderPass = encoder.beginRenderPass(fullScreenRenderPassDescriptor); 

            renderPass.setPipeline(this.FullScreenPipeline); 
            renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup); 
            renderPass.setBindGroup(shaders.constants.bindGroup_framebuffer, this.gBufferBindGroup); 
            renderPass.draw(6); 

            renderPass.end(); 
        }

        renderer.device.queue.submit([encoder.finish()]); 

        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
    }
}
