import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    gBufferColorTexture: GPUTexture;
    gBufferColorTextureView: GPUTextureView;

    gBufferNormalTexture: GPUTexture;
    gBufferNormalTextureView: GPUTextureView;

    gBufferDepthTexture: GPUTexture;
    gBufferDepthTextureView: GPUTextureView;

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

        this.gBufferNormalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float',
        });

        this.gBufferNormalTextureView = this.gBufferNormalTexture.createView();

        this.gBufferDepthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'r32float',
        });

        this.gBufferDepthTextureView = this.gBufferDepthTexture.createView();

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
                    // normal
                    { format: 'rgba16float' },
                    // depth
                    { format: 'r32float' }
                ]
            }
        });

        /* Set up for reading from g-buffer / deferred rendering */

        this.gBufferTexturesBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "g-buffer textures bind group layout",
            entries: [
                { // colorTexture
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // normalTexture
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // depthTexture
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // camera
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                },
                { // clusterSet
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // lightSet
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterUniforms
                    binding: 6,
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
                    resource: this.gBufferNormalTextureView
                },
                {
                    binding: 2,
                    resource: this.gBufferDepthTextureView
                },
                {
                    binding: 3,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 4,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                },
                {
                    binding: 5,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 6,
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
                    view: this.gBufferNormalTextureView,
                    clearValue: [0, 0, 1, 1],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.gBufferDepthTextureView,
                    clearValue: [0, 0, 0, 1],
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
        }, primitive => {
            gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufferPass.drawIndexed(primitive.numIndices);
        });

        gBufferPass.end();

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

        /* Deferred rendering pass */

        canvasRenderPass.setPipeline(this.canvasPipeline);
        canvasRenderPass.setBindGroup(shaders.constants.bindGroup_scene, this.gBufferTexturesBindGroup);
        canvasRenderPass.draw(6); // Draw 6 vertices (2 triangles) for a fullscreen quad

        canvasRenderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
