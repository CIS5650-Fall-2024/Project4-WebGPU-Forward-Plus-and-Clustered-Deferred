import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    // G-buffer textures
    positionTexture: GPUTexture;
    normalTexture: GPUTexture;
    albedoTexture: GPUTexture;

    // G-buffer texture views
    positionTextureView: GPUTextureView;
    normalTextureView: GPUTextureView;
    albedoTextureView: GPUTextureView;

    // Scene bind group layout and bind group
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    fullscreenBindGroupLayout: GPUBindGroupLayout;
    fullscreenBindGroup: GPUBindGroup;

    // Depth texture
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    // G-buffer render pipeline
    gBufferPipeline: GPURenderPipeline;

    // Fullscreen render pipeline
    fullscreenPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        // Initialize G-buffer textures
        const canvasWidth = renderer.canvas.width;
        const canvasHeight = renderer.canvas.height;

        if (canvasWidth === 0 || canvasHeight === 0) {
            console.error('Canvas dimensions are zero. Ensure the canvas is properly initialized.');
        }

        // Position texture
        this.positionTexture = renderer.device.createTexture({
            size: [canvasWidth, canvasHeight],
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.positionTextureView = this.positionTexture.createView();

        // Normal texture
        this.normalTexture = renderer.device.createTexture({
            size: [canvasWidth, canvasHeight],
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.normalTextureView = this.normalTexture.createView();

        // Albedo texture
        this.albedoTexture = renderer.device.createTexture({
            size: [canvasWidth, canvasHeight],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.albedoTextureView = this.albedoTexture.createView();

        // Depth texture
        this.depthTexture = renderer.device.createTexture({
            size: [canvasWidth, canvasHeight],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthTextureView = this.depthTexture.createView();

        // Scene Uniforms Bind Group Layout
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: 'Scene Uniforms Bind Group Layout',
            entries: [
                {
                    // Camera Uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: 'uniform' },
                },
                {
                    // Light Set
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'read-only-storage' },
                },
                {
                    // Cluster Set
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: 'read-only-storage' },
                },
            ],
        });

        // Scene Uniforms Bind Group
        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: 'Scene Uniforms Bind Group',
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer },
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterLightsBuffer },
                },
            ],
        });

        // G-buffer Render Pipeline
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            label: 'G-buffer Render Pipeline',
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: 'G-buffer Vertex Shader',
                    code: shaders.naiveVertSrc,
                }),
                entryPoint: 'main',
                buffers: [renderer.vertexBufferLayout],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: 'G-buffer Fragment Shader',
                    code: shaders.clusteredDeferredFragSrc,
                }),
                entryPoint: 'main',
                targets: [
                    { format: 'rgba16float' }, // Position texture
                    { format: 'rgba16float' }, // Normal texture
                    { format: 'rgba8unorm' },  // Albedo texture
                ],
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            },
        });

        /***** Fullscreen Pass *****/

        // Create the bind group layout for the fullscreen pass
        this.fullscreenBindGroupLayout = renderer.device.createBindGroupLayout({
            label: 'Fullscreen Bind Group Layout',
            entries: [
                {
                    binding: 0, // Position Texture
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
                {
                    binding: 1, // Normal Texture
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
                {
                    binding: 2, // Albedo Texture
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
                {
                    binding: 3, // Position Texture Sampler
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
                {
                    binding: 4, // Normal Texture Sampler
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
                {
                    binding: 5, // Albedo Texture Sampler
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
            ],
        });

        // Create the bind group for the fullscreen pass
        this.fullscreenBindGroup = renderer.device.createBindGroup({
            layout: this.fullscreenBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.positionTextureView,
                },
                {
                    binding: 1,
                    resource: this.normalTextureView,
                },
                {
                    binding: 2,
                    resource: this.albedoTextureView,
                },
                {
                    binding: 3,
                    resource: renderer.device.createSampler({}),
                },
                {
                    binding: 4,
                    resource: renderer.device.createSampler({}),
                },
                {
                    binding: 5,
                    resource: renderer.device.createSampler({}),
                },
            ],
        });

        // Fullscreen Render Pipeline
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            label: 'Fullscreen Render Pipeline',
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.fullscreenBindGroupLayout
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: 'Fullscreen Vertex Shader',
                    code: shaders.clusteredDeferredFullscreenVertSrc,
                }),
                entryPoint: 'main',
                buffers: [],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: 'Fullscreen Fragment Shader',
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                entryPoint: 'main',
                targets: [
                    { format: renderer.canvasFormat },
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

        this.lights.doLightClustering(encoder);

        // G-buffer render pass
        const gBufferPass = encoder.beginRenderPass({
            label: 'G-buffer Render Pass',
            colorAttachments: [
                {
                    view: this.positionTextureView,
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: [0, 0, 0, 0],
                },
                {
                    view: this.normalTextureView,
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: [0, 0, 0, 0],
                },
                {
                    view: this.albedoTextureView,
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: [0, 0, 0, 0],
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
                depthClearValue: 1.0,
            },
        });

        // Set up the G-buffer pipeline and bind groups
        gBufferPass.setPipeline(this.gBufferPipeline);
        gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufferPass.drawIndexed(primitive.numIndices);
        });

        gBufferPass.end();

        /***** Fullscreen Pass *****/

        // Fullscreen pass
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const fullscreenPass = encoder.beginRenderPass({
            label: 'Fullscreen Render Pass',
            colorAttachments: [
                {
                    view: canvasTextureView,
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: [0, 0, 0, 1],
                },
            ],
        });

        // Set up the fullscreen pipeline and bind groups
        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        fullscreenPass.setBindGroup(1, this.fullscreenBindGroup);

        fullscreenPass.draw(3);

        fullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
