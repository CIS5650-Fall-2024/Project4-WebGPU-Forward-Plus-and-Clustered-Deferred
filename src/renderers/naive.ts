import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class NaiveRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    pipeline: GPURenderPipeline;

    renderBundle: GPURenderBundle;

    constructor(stage: Stage) {
        super(stage);

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                // TODO-1.2: add an entry for camera uniforms at binding 0, visible to only the vertex shader, and of type "uniform"
                { // Camera Uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // View Uniforms
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet
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
                { // Camera Uniforms
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                { // Camera Uniforms
                    binding: 1,
                    resource: { buffer: this.camera.viewUniformBuffer }
                },
                {
                    binding: 2,
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

        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "naive pipeline layout",
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
                    label: "naive frag shader",
                    code: shaders.naiveFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });

        // Render bundle
        {
            const renderBundleEncoder = renderer.device.createRenderBundleEncoder({
                colorFormats: [renderer.canvasFormat],
                depthStencilFormat: 'depth24plus',
            });

            renderBundleEncoder.setPipeline(this.pipeline);
            renderBundleEncoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
            this.scene.iterate(node => {
                renderBundleEncoder.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
            }, material => {
                renderBundleEncoder.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
            }, primitive => {
                renderBundleEncoder.setVertexBuffer(0, primitive.vertexBuffer);
                renderBundleEncoder.setIndexBuffer(primitive.indexBuffer, 'uint32');
                renderBundleEncoder.drawIndexed(primitive.numIndices);
            });
            this.renderBundle = renderBundleEncoder.finish();
        }
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // Render pass
        {
            const renderPass = encoder.beginRenderPass({
                label: "naive render pass",
                colorAttachments: [
                    {
                        view: renderer.useBloom ? this.screenTextureView : canvasTextureView,
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

            renderPass.setPipeline(this.pipeline);

            // TODO-1.2: bind `this.sceneUniformsBindGroup` to index `shaders.constants.bindGroup_scene`
            if(renderer.useRenderBundles)
            {
                renderPass.executeBundles([this.renderBundle]);
                // console.log('11111');
            }
            else
            {
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
                // console.log('22222');
            }

            renderPass.end();
        }

        // Bloom
        {
            if (renderer.useBloom)
            {
                this.canvasBloom(encoder);
            }
        }

        renderer.device.queue.submit([encoder.finish()]);
    }
}
