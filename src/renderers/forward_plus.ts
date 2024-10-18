import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    lightClustersBindGroupLayout: GPUBindGroupLayout;
    lightClustersBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    pipeline: GPURenderPipeline;
    renderBundle : GPURenderBundle;

    constructor(stage: Stage) {
        super(stage);

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                { // camera uniforms
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                }
            ]
        });

        this.lightClustersBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // z bins
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // light clusters
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.lightClustersBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.lightClustersBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lights.zbinsStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightsClusterStorageBuffer}
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
                    renderer.materialBindGroupLayout,
                    this.lightClustersBindGroupLayout
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
                    code: shaders.forwardPlusFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });

        let bundleEncoder = renderer.device.createRenderBundleEncoder({
            colorFormats: [renderer.canvasFormat],
            depthStencilFormat: "depth24plus",
        });
          
        bundleEncoder.setPipeline(this.pipeline);

        bundleEncoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        bundleEncoder.setBindGroup(shaders.constants.bindGroup_lightCluster, this.lightClustersBindGroup);

        this.scene.iterate(node => {
            bundleEncoder.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            bundleEncoder.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            bundleEncoder.setVertexBuffer(0, primitive.vertexBuffer);
            bundleEncoder.setIndexBuffer(primitive.indexBuffer, 'uint32');
            bundleEncoder.drawIndexed(primitive.numIndices);
        });

        this.renderBundle = bundleEncoder.finish();
    }

    encodeRenderCommands(renderPass: GPURenderPassEncoder) {
        renderPass.setPipeline(this.pipeline);

        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        renderPass.setBindGroup(shaders.constants.bindGroup_lightCluster, this.lightClustersBindGroup);

        this.scene.iterate(node => {
            renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            renderPass.setVertexBuffer(0, primitive.vertexBuffer);
            renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            renderPass.drawIndexed(primitive.numIndices);
        });

    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const renderPass = encoder.beginRenderPass({
            label: "forward plus render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
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

        if (this.bUseRenderBundles) {
            renderPass.executeBundles([this.renderBundle]);
        }
        else {
            this.encodeRenderCommands(renderPass);
        }
        
        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
