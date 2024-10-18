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

    lightClusterBindGroupLayout: GPUBindGroupLayout;
    lightClusterBindGroup: GPUBindGroup;

    gBufferTextureLayout: GPUBindGroupLayout;
    gBufferTexture: GPUTexture;
    gBufferTextureView: GPUTextureView;
    gBufferTextureSampler: GPUSampler;
    gBufferBindGroup: GPUBindGroup;
    gBufferPipeline: GPURenderPipeline;

    pipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { 
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                },
                { 
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group in deferred ts",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                { 
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.lightClusterBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout in deferred ts",
            entries: [
                { 
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { 
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.lightClusterBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.lightClusterBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lights.zStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightsClusterStorageBuffer}
                }
            ]
        });

        // create gbuffer texture
        this.gBufferTextureLayout = renderer.device.createBindGroupLayout({
            label: "material bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {sampleType: "uint"}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                }
            ]
        });

        this.gBufferTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32uint",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gBufferTextureView = this.gBufferTexture.createView();
        let samplerDescriptor: GPUSamplerDescriptor = {
            magFilter: 'nearest',
            minFilter: 'nearest',
            mipmapFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge'
        };
        this.gBufferTextureSampler = renderer.device.createSampler(samplerDescriptor);

        // create gbuffer bind group
        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "gbuffer texture bind group",
            layout: this.gBufferTextureLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.gBufferTextureView
                },
                {
                    binding: 1,
                    resource: this.gBufferTextureSampler
                }
            ]
        });

        // create gbuffer pipeline
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "gbuffer pipeline layout",
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
                    label: "gbuffer vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "gbuffer frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: "rgba32uint",
                    }
                ]
            }
        });

        // create shading pipeline
        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferTextureLayout,
                    this.lightClusterBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                buffers: [ renderer.quadVertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat
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

        //gbuffer renderpass
        const gBufferRenderPass = encoder.beginRenderPass({
            label: "gbuffer pass",
            colorAttachments: [
                {
                    view: this.gBufferTextureView,
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

        //shading renderpass
        const shadingRenderPass = encoder.beginRenderPass({
            label: "deferred shading pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        shadingRenderPass.setPipeline(this.pipeline);
        shadingRenderPass.setBindGroup(0, this.sceneUniformsBindGroup);
        shadingRenderPass.setBindGroup(1, this.gBufferBindGroup);
        shadingRenderPass.setBindGroup(2, this.lightClusterBindGroup);
        shadingRenderPass.setVertexBuffer(0, this.quadVertexBuffer);
        shadingRenderPass.setIndexBuffer(this.quadIndexBuffer, 'uint32');
        shadingRenderPass.drawIndexed(6);
        shadingRenderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
