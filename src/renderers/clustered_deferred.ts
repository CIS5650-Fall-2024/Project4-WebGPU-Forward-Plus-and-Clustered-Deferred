import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    clusteredDeferredBindGroupLayout: GPUBindGroupLayout;
    clusteredDeferredBindGroup: GPUBindGroup;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;
    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    
    fullscreenPipeline: GPURenderPipeline;
    gBufferPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                {
                    // camera uniforms at binding 0
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform"}
                },
                {   // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                {   // clusterSet
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
                {   // camera
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer}
                },
                {   // lightset
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {   // clusterset
                    binding: 2,
                    resource: { buffer: this.lights.lightsClusterStorageBuffer }
                }
            ]
        });
        // G-buffer textures
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

        // clusteredDeferred
        this.clusteredDeferredBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "clustered deferred bind group layout",
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
        this.clusteredDeferredBindGroup = renderer.device.createBindGroup({
            label: "clustered deferred bind group",
            layout: this.clusteredDeferredBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.albedoTextureView
                },
                {
                    binding: 1,
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
        // two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.clusteredDeferredBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vertex",
                    code: shaders.clusteredDeferredFullscreenVertSrc,
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen fragment",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });
        // g-buffer pipeline
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "g-buffer layout",
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
                    label: "g-buffer vertex shader",
                    code: shaders.naiveVertSrc,
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred fs",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format:"rgba16float",
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
        const encoder = renderer.device.createCommandEncoder();
        this.lights.doLightClustering(encoder);
        // - run the G-buffer pass, outputting position, albedo, and normals
        const gBufferPass = encoder.beginRenderPass({
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
        gBufferPass.setPipeline(this.gBufferPipeline);
        gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        this.scene.iterate(node => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        },primitive => {
            gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufferPass.drawIndexed(primitive.numIndices);
        });
        gBufferPass.end();
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const canvas = renderer.context.getCurrentTexture().createView();
        const fullscreenPass = encoder.beginRenderPass({
            label: "Fullscreen render pass",
            colorAttachments: [
                {
                    view: canvas,
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_model, this.clusteredDeferredBindGroup);
        fullscreenPass.draw(5, 1, 0, 0); 
        fullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
