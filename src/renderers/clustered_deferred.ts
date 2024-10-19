import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;
    sceneTextureBindGroupLayout: GPUBindGroupLayout;
    sceneTextureBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    positionTexture: GPUTexture;
    albedoTexture: GPUTexture;
    normalTexture: GPUTexture;

    positionTextureView: GPUTextureView;
    albedoTextureView: GPUTextureView;
    normalTextureView: GPUTextureView;

    firstPipeline: GPURenderPipeline;
    secondPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.positionTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.positionTextureView = this.positionTexture.createView();

        this.albedoTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.albedoTextureView = this.albedoTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTextureView = this.normalTexture.createView();

        this.sceneTextureBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene texture bind group layout",
            entries: [
                { // position texture
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'unfilterable-float' }
                },
                { // albedo texture
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'unfilterable-float' }
                },
                { // normal texture
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'unfilterable-float' }
                },
                { // sampler
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: 'non-filtering' }
                }
            ]
        });

        this.sceneTextureBindGroup = renderer.device.createBindGroup({
            label: "scene texture bind group",
            layout: this.sceneTextureBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.positionTextureView,
                },
                {
                    binding: 1,
                    resource: this.albedoTextureView,
                },
                {
                    binding: 2,
                    resource: this.normalTextureView,
                },
                {
                    binding: 3,
                    resource: renderer.device.createSampler()
                }
            ]
        });

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                // TODO-1.2: add an entry for camera uniforms at binding 0, visible to only the vertex shader, and of type "uniform"
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
                { // clusters
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
                // TODO-1.2: add an entry for camera uniforms at binding 0
                // you can access the camera using `this.camera`
                // if you run into TypeScript errors, you're probably trying to upload the host buffer instead
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
                    resource: { buffer: this.lights.clusteringSetStorageBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.firstPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "first pass clustered deferred pipeline layout",
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
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "cluster deferred frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: "rgba32float"
                    },
                    {
                        format: "rgba8unorm"
                    },
                    {
                        format: "rgba8unorm"
                    }
                ]
            }
        });

        this.secondPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "second pass clustered deferred pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.sceneTextureBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred fullscreen frag shader",
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

        this.lights.doLightClustering(encoder);

        const renderPass = encoder.beginRenderPass({
            label: "first render pass",
            colorAttachments: [
                {
                    view: this.positionTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.albedoTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.normalTextureView,
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

        renderPass.setPipeline(this.firstPipeline);

        // TODO-1.2: bind `this.sceneUniformsBindGroup` to index `shaders.constants.bindGroup_scene`
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

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

        const secondRenderPass = encoder.beginRenderPass({
            label: "second render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });

        secondRenderPass.setPipeline(this.secondPipeline);

        secondRenderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        secondRenderPass.setBindGroup(shaders.constants.bindGroup_texture, this.sceneTextureBindGroup);

        // draw two triangles to cover the screen
        secondRenderPass.draw(6);

        secondRenderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
