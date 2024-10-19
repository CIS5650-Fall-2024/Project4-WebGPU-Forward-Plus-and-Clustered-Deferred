import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gbuffer: GPUTexture;
    gbuffer_texture_view: GPUTextureView;
    gbuffer_pipeline: GPURenderPipeline;
    
    render_bind_group_layout: GPUBindGroupLayout;
    render_bind_group: GPUBindGroup;
    render_pipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // cameraUniforms
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

        this.gbuffer = renderer.device.createTexture({
            label: "gbuffer",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        })
        this.gbuffer_texture_view = this.gbuffer.createView();

        this.depthTexture = renderer.device.createTexture({
            label: "depth texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();
    
        this.gbuffer_pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "cluster deferred initial pipeline",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "cluster deferred initial vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "cluster deferred initial frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: this.gbuffer.format
                    }
                ]
            }
        });

        this.render_bind_group_layout = renderer.device.createBindGroupLayout({
            label: "render bind group layout",
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
                { // gbuffer
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float"}
                },
                { // depth
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth"}
                },
            ]
        });

        this.render_bind_group = renderer.device.createBindGroup({
            label: "render bind group layout",
            layout: this.render_bind_group_layout,
            entries: [
                { // camera uniforms
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                { // lightSet
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                { // gbuffer
                    binding: 2,
                    resource: this.gbuffer_texture_view
                },
                { // depth
                    binding: 3,
                    resource: this.depthTextureView
                },
            ]
        });

        this.render_pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "cluster deferred final render pipeline",
                bindGroupLayouts: [
                    this.render_bind_group_layout,
                    this.lights.cluster_lights_bind_group_layout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "cluster deferred final render vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "cluster deferred final render frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc
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
        const encoder = renderer.device.createCommandEncoder();
        this.lights.doLightClustering(encoder);

        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const initialPass = encoder.beginRenderPass({
            label: "cluster deferred initial pass",
            colorAttachments: [
                {
                    view: this.gbuffer_texture_view,
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
        initialPass.setPipeline(this.gbuffer_pipeline);

        initialPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            initialPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            initialPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            initialPass.setVertexBuffer(0, primitive.vertexBuffer);
            initialPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            initialPass.drawIndexed(primitive.numIndices);
        });

        initialPass.end();

        const renderPass = encoder.beginRenderPass({
            label: "cluster deferred final render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
        });

        renderPass.setPipeline(this.render_pipeline);

        renderPass.setBindGroup(0, this.render_bind_group);
        renderPass.setBindGroup(1, this.lights.cluster_lights_bind_group);

        renderPass.draw(6);
        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
