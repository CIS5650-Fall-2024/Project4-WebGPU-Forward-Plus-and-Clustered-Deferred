import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;
    pipeline: GPURenderPipeline;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufferPositionTexture: GPUTexture;
    gBufferPositionTextureView: GPUTextureView;

    gBufferAlbedoTexture: GPUTexture;
    gBufferAlbedoTextureView: GPUTextureView;

    gBufferNormalTexture: GPUTexture;
    gBufferNormalTextureView: GPUTextureView;

    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;
    gBufferPipeline: GPURenderPipeline;

    indexBuffer: GPUBuffer;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        const indexData = new Uint32Array([
            0, 1, 2,
            2, 1, 3 
        ]);
        
        this.indexBuffer = renderer.device.createBuffer({
            size: indexData.byteLength, 
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true  
        });
        
        new Uint32Array(this.indexBuffer.getMappedRange()).set(indexData);
        this.indexBuffer.unmap();
        
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                {
                    // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" } 
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                {
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
                    resource: { buffer: this.lights.clusteringBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        this.gBufferPositionTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gBufferPositionTextureView = this.gBufferPositionTexture.createView();

        this.gBufferAlbedoTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gBufferAlbedoTextureView = this.gBufferAlbedoTexture.createView();

        this.gBufferNormalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gBufferNormalTextureView = this.gBufferNormalTexture.createView();

        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G buffer bind group layout",
            entries: [
                {   //position
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {sampleType: 'unfilterable-float'} 
                },
                {
                    //albedo
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {sampleType: 'float'}
                },
                {
                    //normal
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {sampleType: 'float'} 
                },
                {
                    //sampler
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {type: 'non-filtering'} 
                }
            ]
        });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.gBufferPositionTextureView
                },
                {
                    binding: 1,
                    resource: this.gBufferAlbedoTextureView
                },
                {
                    binding: 2,
                    resource: this.gBufferNormalTextureView
                },
                {
                    binding: 3,
                    resource: renderer.device.createSampler()
                }
            ]
        });

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "G buffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth32float"
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
                    label: "G buffer frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: 'rgba32float'
                    },{
                        format: 'rgba16float'
                    },{
                        format: 'rgba16float'
                    }
                ]
            }
        });

        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "full screen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,  
                    this.gBufferBindGroupLayout          
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                entryPoint: "main"
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteredDeferredFullscreenFragSrc
                }),
                entryPoint: "main",
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
        const encoder = renderer.device.createCommandEncoder();
        // - run the clustering compute shader
        this.lights.doLightClustering(encoder);

        // - run the G-buffer pass, outputting position, albedo, and normals
        const gBufferPass = encoder.beginRenderPass({
            label: "G Buffer pass",
            colorAttachments: [
                {
                    view: this.gBufferPositionTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },{
                    view: this.gBufferAlbedoTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },{
                    view: this.gBufferNormalTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        gBufferPass.setPipeline(this.gBufferPipeline);

        // TODO-1.2: bind `this.sceneUniformsBindGroup` to index `shaders.constants.bindGroup_scene`
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

        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: canvasTextureView,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        renderPass.setBindGroup(shaders.constants.bindGroup_model, this.gBufferBindGroup);

        renderPass.setIndexBuffer(this.indexBuffer, 'uint32');
        renderPass.drawIndexed(6);

        renderPass.end();
        renderer.device.queue.submit([encoder.finish()]);
    }
}
