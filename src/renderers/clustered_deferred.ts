import * as renderer from "../renderer";
import * as shaders from "../shaders/shaders";
import { Stage } from "../stage/stage";

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for ClusteredDeferred here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    depthTextureSampler: GPUSampler;

    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    gBufferColorTexture: GPUTexture;
    gBufferColorTextureView: GPUTextureView;
    gBufferColorTextureSampler: GPUSampler;

    gBufferNormalTexture: GPUTexture;
    gBufferNormalTextureView: GPUTextureView;
    gBufferNormalTextureSampler: GPUSampler;

    gBufferPipeline: GPURenderPipeline;
    pipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for ClusteredDeferred here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.sceneUniformsBindGroupLayout =
            renderer.device.createBindGroupLayout({
                label: "scene uniforms bind group layout",
                entries: [
                    {
                        // camera uniforms
                        binding: 0,
                        visibility:
                            GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                        buffer: { type: "uniform" },
                    },
                    {
                        // lightSet
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        buffer: { type: "read-only-storage" },
                    },
                    {
                        // clusterSet
                        binding: 2,
                        visibility: GPUShaderStage.FRAGMENT,
                        buffer: { type: "read-only-storage" },
                    },
                ],
            });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
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
                    resource: { buffer: this.lights.clusterSetStorageBuffer },
                },
            ],
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING,
        });
        this.depthTextureView = this.depthTexture.createView();

        this.depthTextureSampler = renderer.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
        });

        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "float",
                    },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "float",
                    },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "depth",
                    },
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
            ],
        });

        this.gBufferColorTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING,
        });
        this.gBufferNormalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING,
        });

        this.gBufferColorTextureView = this.gBufferColorTexture.createView();
        this.gBufferNormalTextureView = this.gBufferNormalTexture.createView();

        this.gBufferColorTextureSampler = renderer.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
        });
        this.gBufferNormalTextureSampler = renderer.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
        });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "G-buffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.gBufferColorTextureView,
                },
                {
                    binding: 1,
                    resource: this.gBufferColorTextureSampler,
                },
                {
                    binding: 2,
                    resource: this.gBufferNormalTextureView,
                },
                {
                    binding: 3,
                    resource: this.gBufferNormalTextureSampler,
                },
                {
                    binding: 4,
                    resource: this.depthTextureView,
                },
                {
                    binding: 5,
                    resource: this.depthTextureSampler,
                },
            ],
        });

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "G-buffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                ],
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer vert shader (naive vert shader)",
                    code: shaders.naiveVertSrc,
                }),
                buffers: [renderer.vertexBufferLayout],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: "rgba8unorm",
                    },
                    {
                        format: "rgba16float",
                    },
                ],
            },
        });

        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferBindGroupLayout,
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc,
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    },
                ],
            },
        });
    }

    override draw() {
        // TODO-3: run the ClusteredDeferred rendering pass:
        const encoder = renderer.device.createCommandEncoder();

        // - run the clustering compute shader
        this.lights.doLightClustering(encoder);

        // - run the G-buffer pass, outputting position, albedo, and normals
        const gBufferPass = encoder.beginRenderPass({
            label: "G-buffer pass",
            colorAttachments: [
                {
                    view: this.gBufferColorTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.gBufferNormalTextureView,
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
        gBufferPass.setPipeline(this.gBufferPipeline);

        gBufferPass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.sceneUniformsBindGroup
        );

        this.scene.iterate(
            (node) => {
                gBufferPass.setBindGroup(
                    shaders.constants.bindGroup_model,
                    node.modelBindGroup
                );
            },
            (material) => {
                gBufferPass.setBindGroup(
                    shaders.constants.bindGroup_material,
                    material.materialBindGroup
                );
            },
            (primitive) => {
                gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
                gBufferPass.setIndexBuffer(primitive.indexBuffer, "uint32");
                gBufferPass.drawIndexed(primitive.numIndices);
            }
        );

        gBufferPass.end();

        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const canvasTextureView = renderer.context
            .getCurrentTexture()
            .createView();

        const renderPass = encoder.beginRenderPass({
            label: "deferred render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        renderPass.setPipeline(this.pipeline);

        renderPass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.sceneUniformsBindGroup
        );
        renderPass.setBindGroup(1, this.gBufferBindGroup);
        renderPass.draw(6);
        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
