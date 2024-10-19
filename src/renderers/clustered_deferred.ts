import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    gBufferPassBundleEncoder: GPURenderBundleEncoder;
    gBufferPassBundle: GPURenderBundle;
    deferredPassBundleEncoder: GPURenderBundleEncoder;
    deferredPassBundle: GPURenderBundle;

    gBufferColorTexture: GPUTexture;
    gBufferColorTextureView: GPUTextureView;

    // Pack normal and depth into a single texture to reduce memory bandwidth.
    gBufferNormalAndDepthTexture: GPUTexture;
    gBufferNormalAndDepthTextureView: GPUTextureView;

    // Regular depth texture for first pass. Necessary for depth testing, but it's not ideal for
    // the second pass because it's normalized and doesn't have great precision.
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufferPipeline: GPURenderPipeline;
    canvasPipeline: GPURenderPipeline;

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    gBufferTexturesBindGroupLayout: GPUBindGroupLayout;
    gBufferTexturesBindGroup: GPUBindGroup;

    clusterUniformBuffer: GPUBuffer;

    constructor(stage: Stage) {
        super(stage);

        this.clusterUniformBuffer = renderer.device.createBuffer({
            label: "cluster uniforms",
            size: 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'depth24plus',
        });

        this.depthTextureView = this.depthTexture.createView();

        /* Set up for writing to g-buffer */

        this.gBufferColorTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'bgra8unorm',
        });

        this.gBufferColorTextureView = this.gBufferColorTexture.createView();

        this.gBufferNormalAndDepthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba32float',
        });

        this.gBufferNormalAndDepthTextureView = this.gBufferNormalAndDepthTexture.createView();

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // camera
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
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
                }
            ]
        });

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "G-buffer pipeline layout",
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
                    // albedo
                    { format: 'bgra8unorm' },
                    // normalAndDepth
                    { format: 'rgba32float' }
                ]
            }
        });

        this.gBufferPassBundleEncoder = renderer.device.createRenderBundleEncoder({
            colorFormats: [ 'bgra8unorm', 'rgba32float' ],
            depthStencilFormat: 'depth24plus'
        });

        this.encodeGbufferPassRenderBundle(this.gBufferPassBundleEncoder);
        this.gBufferPassBundle = this.gBufferPassBundleEncoder.finish();

        /* Set up for reading from g-buffer / deferred rendering */

        this.gBufferTexturesBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "g-buffer textures bind group layout",
            entries: [
                { // colorTexture
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // normalAndDepthTexture
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // camera
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                },
                { // clusterSet
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // lightSet
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterUniforms
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.gBufferTexturesBindGroup = renderer.device.createBindGroup({
            label: "g-buffer textures bind group",
            layout: this.gBufferTexturesBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.gBufferColorTextureView
                },
                {
                    binding: 1,
                    resource: this.gBufferNormalAndDepthTextureView
                },
                {
                    binding: 2,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                },
                {
                    binding: 4,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 5,
                    resource: { buffer: this.clusterUniformBuffer }
                }
            ]
        });

        this.canvasPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "canvas pipeline layout",
                bindGroupLayouts: [
                    this.gBufferTexturesBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    { format: renderer.canvasFormat }
                ]
            },
            primitive: {
                topology: "triangle-list",
                cullMode: "back"
            }
        });

        this.deferredPassBundleEncoder = renderer.device.createRenderBundleEncoder({
            colorFormats: [ renderer.canvasFormat ]
        });

        this.encodeDeferredPassRenderBundle(this.deferredPassBundleEncoder);
        this.deferredPassBundle = this.deferredPassBundleEncoder.finish();
    }

    encodeGbufferPassRenderBundle(encoder: GPURenderBundleEncoder) {
        encoder.setPipeline(this.gBufferPipeline);
        encoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            encoder.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            encoder.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            encoder.setVertexBuffer(0, primitive.vertexBuffer);
            encoder.setIndexBuffer(primitive.indexBuffer, 'uint32');
            encoder.drawIndexed(primitive.numIndices);
        });
    }

    encodeDeferredPassRenderBundle(encoder: GPURenderBundleEncoder) {
        encoder.setPipeline(this.canvasPipeline);
        encoder.setBindGroup(shaders.constants.bindGroup_scene, this.gBufferTexturesBindGroup);
        encoder.draw(6); // Draw 6 vertices (2 triangles) for a fullscreen quad
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        this.lights.doLightClustering(encoder, renderer.device);
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        renderer.device.queue.writeBuffer(this.clusterUniformBuffer, 0, new Float32Array(shaders.constants.clusterDimensions));

        /* G-buffer pass */

        const gBufferPass = encoder.beginRenderPass({
            label: "gbuffer pass",
            colorAttachments: [
                {
                    view: this.gBufferColorTextureView,
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.gBufferNormalAndDepthTextureView,
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

        gBufferPass.executeBundles([this.gBufferPassBundle]);
        gBufferPass.end();

        /* Deferred rendering pass */

        const canvasRenderPass = encoder.beginRenderPass({
            label: "canvas render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });

        canvasRenderPass.executeBundles([this.deferredPassBundle]);
        canvasRenderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
