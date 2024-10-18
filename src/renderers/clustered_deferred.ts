import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;


    private DeferredBindGroupLayout: GPUBindGroupLayout;
    private DeferredBindGroup: GPUBindGroup;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;
    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    
    private fullscreenPipeline: GPURenderPipeline;
    private gBufferPipeline: GPURenderPipeline;
    

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
              
                {
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
                    buffer: { type: "storage" }
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

        // Initialize G-buffer textures
        this.albedoTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.albedoTextureView = this.albedoTexture.createView();
        
        this.normalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTextureView = this.normalTexture.createView();


        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();
        
        //copy the code from scene.materil structure about depth texture binding layout
        this.DeferredBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "Deferred BindGroup Layout",
            entries: [
                { // albedoTex
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                { // albedoTexSampler
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                { // normalTex
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                { // normalTexSampler
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                { // depthTex
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" }
                },
                { // depthTexSampler
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
            ]
        });

        this.DeferredBindGroup = renderer.device.createBindGroup({
            label: "material bind group",
            layout: this.DeferredBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.albedoTextureView
                },
                {
                    binding: 1,
                    //https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createSampler
                    resource: renderer.device.createSampler()
                },
                {
                    binding: 2,
                    resource: this.normalTextureView
                },
                {
                    binding: 3,
                    resource: renderer.device.createSampler()
                },
                {
                    binding: 4,
                    resource: this.depthTextureView
                },
                {
                    binding: 5,
                    resource: renderer.device.createSampler()
                },
                
            ]
        });

        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.DeferredBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vert shader",
                    code: shaders.fullscreenVertexScr,
                }),
                
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen frag shader",
                    code: shaders.fullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });




        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "G buffer pipeline layout",
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
                    label: "naive vert shader",
                    code: shaders.naiveVertSrc,
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Deferred cluster frag shader",
                    code: shaders.clusterDeferredSrc,
                }),
                targets: [
                    {
                        format: "rgba16float",
                    },
                    {
                        format: "rgba16float",
                    }
                ]
            }
        });



    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations


        const encoder = renderer.device.createCommandEncoder();
       
        this.lights.doLightClustering(encoder);



        // Run the G-buffer pass
        const GbufferPass = encoder.beginRenderPass({
            label: "GBuffer render pass",
            colorAttachments: [
                {
                    view:  this.albedoTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view:  this.normalTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
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
        GbufferPass.setPipeline(this.gBufferPipeline);
        GbufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            GbufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            GbufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        },primitive => {
            GbufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            GbufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            GbufferPass.drawIndexed(primitive.numIndices);
        });

        GbufferPass.end();

        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const FullscreenPass = encoder.beginRenderPass({
            label: "Fullscreen render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });

        FullscreenPass.setPipeline(this.fullscreenPipeline);
        FullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        FullscreenPass.setBindGroup(shaders.constants.bindGroup_fullscreen, this.DeferredBindGroup);
        FullscreenPass.draw(6, 1, 0, 0); 
        FullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);

    }
}
