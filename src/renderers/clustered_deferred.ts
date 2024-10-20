import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    gBufBindGroupLayout: GPUBindGroupLayout;
    gBufBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufTexture: GPUTexture;
    gBufTextureView: GPUTextureView;

    gBufPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
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
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.depthTextureView = this.depthTexture.createView();

        this.gBufTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.gBufTextureView = this.gBufTexture.createView();

        this.gBufPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "G-Buffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "naive vert shader",
                    code: shaders.naiveVertSrc 
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "G-Buffer frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: this.gBufTexture.format,
                    }
                ]
            }
        });

        this.gBufBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
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
                { // cluster
                  binding: 2,
                  visibility: GPUShaderStage.FRAGMENT,
                  buffer: { type: "read-only-storage" }
                },
                { // depth buffer
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // G-Buffer
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // Texture Sampler
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "non-filtering" }
                },
            ]
        });
        this.gBufBindGroup = renderer.device.createBindGroup({
            label: "G-Buffer bind group",
            layout: this.gBufBindGroupLayout,
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
                },
                {
                    binding: 3,
                    resource: this.depthTextureView
                },
                {
                    binding: 4,
                    resource: this.gBufTextureView
                },
                {
                    binding: 5,
                    resource: renderer.device.createSampler()
                },
            ]
        });

        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "Fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.gBufBindGroupLayout,
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc 
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Fullscreen frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
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
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
    
        // Compute Pass
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.lights.clusterPipeline);
        computePass.setBindGroup(shaders.constants.bindGroup_scene, this.lights.clusterBindGroup);
        computePass.dispatchWorkgroups(
            Math.ceil(shaders.constants.clustersAlongX / shaders.constants.workGroupSizeX),
            Math.ceil(shaders.constants.clustersAlongY / shaders.constants.workGroupSizeY),
            Math.ceil(shaders.constants.clustersAlongZ / shaders.constants.workGroupSizeZ) 
        );
        computePass.end();
    
        // Render Pass
        const gBufRenderPass = encoder.beginRenderPass({
            label: "G-Buffer render pass",
            colorAttachments: [
                {
                    view: this.gBufTextureView,
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
        gBufRenderPass.setPipeline(this.gBufPipeline);


        gBufRenderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
    
        this.scene.iterate(node => {
            gBufRenderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gBufRenderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gBufRenderPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufRenderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufRenderPass.drawIndexed(primitive.numIndices);
        });
    
        gBufRenderPass.end();

        const fullscreenRenderPass = encoder.beginRenderPass({
            label: "Fullscreen render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        fullscreenRenderPass.setPipeline(this.fullscreenPipeline);
        fullscreenRenderPass.setBindGroup(0, this.gBufBindGroup);
        fullscreenRenderPass.draw(6);
        fullscreenRenderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
