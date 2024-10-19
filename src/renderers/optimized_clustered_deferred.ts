// File: renderers/optimized_clustered_deferred.ts

import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class OptimizedClusteredDeferredRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufferTextures: {
        packedData: GPUTexture;
    };
    gBufferTextureViews: {
        packedData: GPUTextureView;
    };
    gBufferPipeline: GPURenderPipeline;

    lightingComputePipeline: GPUComputePipeline;
    lightingComputeBindGroupLayout: GPUBindGroupLayout;
    lightingComputeBindGroup: GPUBindGroup;

    outputTexture: GPUTexture;
    outputTextureView: GPUTextureView;

    fullscreenCopyPipeline: GPURenderPipeline;
    fullscreenCopyBindGroupLayout: GPUBindGroupLayout;
    fullscreenCopyBindGroup: GPUBindGroup;

    constructor(stage: Stage) {
        super(stage);

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
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
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterLightsBuffer }
                }
            ]
        });

        this.gBufferTextures = {
            packedData: renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: 'rgba32uint',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            })
        };
        this.gBufferTextureViews = {
            packedData: this.gBufferTextures.packedData.createView()
        };

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "optimized clustered deferred G-buffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout  
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    code: shaders.naiveVertSrc 
                }),
                entryPoint: "main",
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    code: shaders.optimizedClusteredDeferredFragSrc
                }),
                entryPoint: "main",
                targets: [
                    { format: 'rgba32uint' }  
                ]
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth32float"
            }
        });

        this.outputTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: 'rgba8unorm',
            //format: 'bgra8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.outputTextureView = this.outputTexture.createView();

        this.lightingComputeBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "lighting compute bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }, // cameraUniforms
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }, // lightSet
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }, // clusterLights
                { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "uint" } }, // G-buffer texture
                { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "depth" } }, // Depth texture
                { binding: 5, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: 'rgba8unorm' } }, // Output texture
            ],
        });

        this.lightingComputeBindGroup = renderer.device.createBindGroup({
            label: "lighting compute bind group",
            layout: this.lightingComputeBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.clusterLightsBuffer } },
                { binding: 3, resource: this.gBufferTextureViews.packedData },
                { binding: 4, resource: this.depthTextureView },
                { binding: 5, resource: this.outputTextureView },
            ],
        });


        this.lightingComputePipeline = renderer.device.createComputePipeline({
            layout: renderer.device.createPipelineLayout({
                label: "lighting compute pipeline layout",
                bindGroupLayouts: [ this.lightingComputeBindGroupLayout ],
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "lighting compute shader",
                    code: shaders.optimizedLightingComputeSrc,
                }),
                entryPoint: "main",
            },
        });


        const fullscreenSampler = renderer.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'nearest',
        });


        this.fullscreenCopyBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "fullscreen copy bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
            ],
        });


        this.fullscreenCopyBindGroup = renderer.device.createBindGroup({
            label: "fullscreen copy bind group",
            layout: this.fullscreenCopyBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.outputTextureView, 
                },
                {
                    binding: 1,
                    resource: fullscreenSampler,
                },
            ],
        });


        this.fullscreenCopyPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "fullscreen copy pipeline layout",
                bindGroupLayouts: [
                    this.fullscreenCopyBindGroupLayout,
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    code: shaders.fullscreenCopyVertSrc,
                }),
                entryPoint: "main",
                buffers: [],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    code: shaders.fullscreenCopyFragSrc,
                }),
                entryPoint: "main",
                targets: [
                    { format: renderer.canvasFormat },
                ],
            },
            primitive: {
                topology: 'triangle-list',
                stripIndexFormat: undefined,
                frontFace: 'ccw',
                cullMode: 'none',
            },
        });
    
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();

     
        this.lights.doLightClustering(encoder);

   
        const gBufferPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.gBufferTextureViews.packedData,
                    loadOp: "clear",
                    storeOp: "store",
                    clearValue: { r: 0, g: 0, b: 0, a: 0 }
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

 
        const computePass = encoder.beginComputePass({
            label: "lighting compute pass",
        });
        computePass.setPipeline(this.lightingComputePipeline);
        computePass.setBindGroup(0, this.lightingComputeBindGroup);

        const workGroupSizeX = 16;
        const workGroupSizeY = 16;
        const dispatchX = Math.ceil(renderer.canvas.width / workGroupSizeX);
        const dispatchY = Math.ceil(renderer.canvas.height / workGroupSizeY);

        computePass.dispatchWorkgroups(dispatchX, dispatchY);
        computePass.end();

   
        const fullscreenPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: renderer.context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }
            }]
        });

        // encoder.copyTextureToTexture(
        //     { texture: this.outputTexture },
        //     { texture: renderer.context.getCurrentTexture() },
        //     [renderer.canvas.width, renderer.canvas.height, 1]
        // );
        fullscreenPass.setPipeline(this.fullscreenCopyPipeline);
        fullscreenPass.setBindGroup(0, this.fullscreenCopyBindGroup);
        fullscreenPass.draw(3, 1, 0, 0);
        fullscreenPass.end();

   
        renderer.device.queue.submit([encoder.finish()]);
    }

}
