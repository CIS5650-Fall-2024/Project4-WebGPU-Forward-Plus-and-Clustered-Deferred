import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufferTextures: { position: GPUTexture, normal: GPUTexture, albedo: GPUTexture };
    gBufferTextureViews: { position: GPUTextureView, normal: GPUTextureView, albedo: GPUTextureView };
    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;
    gBufferTexturesBindGroupLayout: GPUBindGroupLayout;
    gBufferTexturesBindGroup: GPUBindGroup;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
                // Scene uniforms bind group layout and bind group (same as in Forward+)
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "clustered deferred scene uniforms bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // cameraUniforms
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } }, // lightSet
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } }, // clusterLights
            ],
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "clustered deferred scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.clusterLightsBuffer } },
            ],
        });
        
        // G-buffer textures
        const canvasWidth = renderer.canvas.width;
        const canvasHeight = renderer.canvas.height;

        this.gBufferTextures = {
            position: renderer.device.createTexture({
                size: [canvasWidth, canvasHeight],
                format: 'rgba16float',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            }),
            normal: renderer.device.createTexture({
                size: [canvasWidth, canvasHeight],
                format: 'rgba16float',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            }),
            albedo: renderer.device.createTexture({
                size: [canvasWidth, canvasHeight],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            }),
        };

        this.gBufferTextureViews = {
            position: this.gBufferTextures.position.createView(),
            normal: this.gBufferTextures.normal.createView(),
            albedo: this.gBufferTextures.albedo.createView(),
        };

        this.depthTexture = renderer.device.createTexture({
            size: [canvasWidth, canvasHeight],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthTextureView = this.depthTexture.createView();

        // G-buffer pipeline
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "clustered deferred G-buffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred vertex shader",
                    code: shaders.naiveVertSrc,
                }),
                entryPoint: "main",
                buffers: [ renderer.vertexBufferLayout ],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred G-buffer fragment shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                entryPoint: "main",
                targets: [
                    { format: 'rgba16float' }, // position
                    { format: 'rgba16float' }, // normal
                    { format: 'rgba8unorm' },  // albedo
                ],
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
        });

        // G-buffer textures bind group layout and bind group
        this.gBufferTexturesBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer textures bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} }, // positionTex
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} }, // normalTex
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} }, // albedoTex
            ],
        });

        this.gBufferTexturesBindGroup = renderer.device.createBindGroup({
            label: "G-buffer textures bind group",
            layout: this.gBufferTexturesBindGroupLayout,
            entries: [
                { binding: 0, resource: this.gBufferTextures.position.createView() },
                { binding: 1, resource: this.gBufferTextures.normal.createView() },
                { binding: 2, resource: this.gBufferTextures.albedo.createView() },
            ],
        });

        // Fullscreen pipeline
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "clustered deferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferTexturesBindGroupLayout,
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred fullscreen vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc,
                }),
                entryPoint: "main",
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred fullscreen fragment shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                entryPoint: "main",
                targets: [
                    {
                        format: renderer.canvasFormat,
                    },
                ],
            },
        });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // Run clustering compute shader
        this.lights.doLightClustering(encoder);

        // G-buffer render pass
        const gBufferRenderPass = encoder.beginRenderPass({
            label: "G-buffer render pass",
            colorAttachments: [
                {
                    view: this.gBufferTextureViews.position,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.gBufferTextureViews.normal,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.gBufferTextureViews.albedo,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        gBufferRenderPass.setPipeline(this.gBufferPipeline);
        gBufferRenderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            gBufferRenderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gBufferRenderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gBufferRenderPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferRenderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufferRenderPass.drawIndexed(primitive.numIndices);
        });

        gBufferRenderPass.end();

        // Fullscreen render pass
        const fullscreenRenderPass = encoder.beginRenderPass({
            label: "fullscreen render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        fullscreenRenderPass.setPipeline(this.fullscreenPipeline);
        fullscreenRenderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        fullscreenRenderPass.setBindGroup(1, this.gBufferTexturesBindGroup);

        fullscreenRenderPass.draw(3);

        fullscreenRenderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
