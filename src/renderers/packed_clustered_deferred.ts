// File: renderers/packed_clustered_deferred.ts

import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class PackedClusteredDeferredRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufferTexture: GPUTexture;
    gBufferTextureView: GPUTextureView;
    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;
    gBufferTexturesBindGroupLayout: GPUBindGroupLayout;
    gBufferTexturesBindGroup: GPUBindGroup;

    constructor(stage: Stage) {
        super(stage);

        // Scene uniforms bind group layout and bind group
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "packed clustered deferred scene uniforms bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
            ],
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "packed clustered deferred scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.clusterLightsBuffer } },
            ],
        });

        // G-buffer texture (single texture)
        const canvasWidth = renderer.canvas.width;
        const canvasHeight = renderer.canvas.height;

        this.gBufferTexture = renderer.device.createTexture({
            size: [canvasWidth, canvasHeight],
            format: 'rgba32uint',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.gBufferTextureView = this.gBufferTexture.createView();

        // Depth texture
        this.depthTexture = renderer.device.createTexture({
            size: [canvasWidth, canvasHeight],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthTextureView = this.depthTexture.createView();

        // G-buffer textures bind group layout and bind group
        this.gBufferTexturesBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "packed G-buffer textures bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'uint' } },
            ],
        });

        this.gBufferTexturesBindGroup = renderer.device.createBindGroup({
            label: "packed G-buffer textures bind group",
            layout: this.gBufferTexturesBindGroupLayout,
            entries: [
                { binding: 0, resource: this.gBufferTextureView },
            ],
        });

        // G-buffer pipeline
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "packed clustered deferred G-buffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "packed clustered deferred vertex shader",
                    code: shaders.naiveVertSrc,
                }),
                entryPoint: "main",
                buffers: [renderer.vertexBufferLayout],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "packed clustered deferred G-buffer fragment shader",
                    code: shaders.packedClusteredDeferredFragSrc,
                }),
                entryPoint: "main",
                targets: [
                    { format: 'rgba32uint' },
                ],
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
        });

        // Fullscreen pipeline
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "packed clustered deferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferTexturesBindGroupLayout,
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "packed clustered deferred fullscreen vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc,
                }),
                entryPoint: "main",
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "packed clustered deferred fullscreen fragment shader",
                    code: shaders.packedClusteredDeferredFullscreenFragSrc,
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
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // Run clustering compute shader
        this.lights.doLightClustering(encoder);

        // G-buffer render pass
        const gBufferRenderPass = encoder.beginRenderPass({
            label: "G-buffer render pass",
            colorAttachments: [
                {
                    view: this.gBufferTextureView,
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
