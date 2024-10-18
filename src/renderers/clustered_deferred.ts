import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    lightClustersBindGroupLayout: GPUBindGroupLayout;
    lightClustersBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufferTextureLayout: GPUBindGroupLayout;
    gBufferTexture: GPUTexture;
    gBufferTextureView: GPUTextureView;
    gBufferTextureSampler: GPUSampler;
    gBufferBindGroup: GPUBindGroup;

    gBufferPipeline: GPURenderPipeline;
    shadingPipeline: GPURenderPipeline;

    gBufferPassRenderBundle: GPURenderBundle;
    shadingPassRenderBundle: GPURenderBundle;

    constructor(stage: Stage) {
        super(stage);

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
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
        this.shadingPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferTextureLayout,
                    this.lightClustersBindGroupLayout
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

        var bundleEncoder = renderer.device.createRenderBundleEncoder({
            colorFormats: ['rgba32uint'],
            depthStencilFormat: 'depth24plus'
        });
          
        bundleEncoder.setPipeline(this.gBufferPipeline);

        bundleEncoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            bundleEncoder.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            bundleEncoder.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            bundleEncoder.setVertexBuffer(0, primitive.vertexBuffer);
            bundleEncoder.setIndexBuffer(primitive.indexBuffer, 'uint32');
            bundleEncoder.drawIndexed(primitive.numIndices);
        });
          
        this.gBufferPassRenderBundle = bundleEncoder.finish();

        bundleEncoder = renderer.device.createRenderBundleEncoder({
            colorFormats: [renderer.canvasFormat],
        });
          
        bundleEncoder.setPipeline(this.shadingPipeline);

        bundleEncoder.setBindGroup(0, this.sceneUniformsBindGroup);
        bundleEncoder.setBindGroup(1, this.gBufferBindGroup);
        bundleEncoder.setBindGroup(2, this.lightClustersBindGroup);

        bundleEncoder.setVertexBuffer(0, this.quadVertexBuffer);
        bundleEncoder.setIndexBuffer(this.quadIndexBuffer, 'uint32');
        bundleEncoder.drawIndexed(6);

        this.shadingPassRenderBundle = bundleEncoder.finish();
    }

    encodeRenderBundleGbufferPass()
    {
        let bundleEncoder = renderer.device.createRenderBundleEncoder({
            colorFormats: ['rgba32uint'],
            depthStencilFormat: 'depth24plus'
        });
          
        bundleEncoder.setPipeline(this.gBufferPipeline);

        bundleEncoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            bundleEncoder.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            bundleEncoder.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            bundleEncoder.setVertexBuffer(0, primitive.vertexBuffer);
            bundleEncoder.setIndexBuffer(primitive.indexBuffer, 'uint32');
            bundleEncoder.drawIndexed(primitive.numIndices);
        });
          
        this.gBufferPassRenderBundle = bundleEncoder.finish();
    }

    encodeRenderBundleShadingPass()
    {
        let bundleEncoder = renderer.device.createRenderBundleEncoder({
            colorFormats: [renderer.canvasFormat],
        });
          
        bundleEncoder.setPipeline(this.shadingPipeline);

        bundleEncoder.setBindGroup(0, this.sceneUniformsBindGroup);
        bundleEncoder.setBindGroup(1, this.gBufferBindGroup);
        bundleEncoder.setBindGroup(2, this.lightClustersBindGroup);

        bundleEncoder.setVertexBuffer(0, this.quadVertexBuffer);
        bundleEncoder.setIndexBuffer(this.quadIndexBuffer, 'uint32');
        bundleEncoder.drawIndexed(6);

        this.shadingPassRenderBundle = bundleEncoder.finish();
    }

    encodeGBufferRenderCommands(gBufferRenderPass: GPURenderPassEncoder)
    {
        // begin gbuffer pass
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

    }

    encodeShadingRenderCommands(shadingRenderPass: GPURenderPassEncoder)
    {
        // begin shading pass
        shadingRenderPass.setPipeline(this.shadingPipeline);

        shadingRenderPass.setBindGroup(0, this.sceneUniformsBindGroup);
        shadingRenderPass.setBindGroup(1, this.gBufferBindGroup);
        shadingRenderPass.setBindGroup(2, this.lightClustersBindGroup);

        shadingRenderPass.setVertexBuffer(0, this.quadVertexBuffer);
        shadingRenderPass.setIndexBuffer(this.quadIndexBuffer, 'uint32');
        shadingRenderPass.drawIndexed(6);

    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        
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

        if (this.bUseRenderBundles){
            gBufferRenderPass.executeBundles([this.gBufferPassRenderBundle]);
        } else {
            this.encodeGBufferRenderCommands(gBufferRenderPass);
        }
        gBufferRenderPass.end();

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

        if (this.bUseRenderBundles){
            shadingRenderPass.executeBundles([this.shadingPassRenderBundle]);
        } else {
            this.encodeShadingRenderCommands(shadingRenderPass);
        }
        shadingRenderPass.end();
        

        renderer.device.queue.submit([encoder.finish()]);
    }
}
