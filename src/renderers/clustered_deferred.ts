import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    // bind group for gBuffers
    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    // G-buffer textures
    diffuseTexture: GPUTexture;
    normalTexture: GPUTexture;


    gBufferTextureViews: GPUTextureView[];

    // pipelines
    gBufferWrittingPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;


    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        // gbuffer textures
        this.diffuseTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "bgra8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        this.normalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        this.gBufferTextureViews = [
            this.diffuseTexture.createView(),
            this.normalTexture.createView(),
            this.depthTexture.createView()
        ];
        // scene uniforms bind group layout
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // camera
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // lightClusters
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
                { // camera
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                { // lightSet
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                { // lightClusters
                    binding: 2,
                    resource: { buffer: this.lights.clustersSetStorageBuffer }
                }
            ]
        });

        // gbuffer bind group layout
        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "gBuffer bind group layout",
            entries: [
                { // diffuse
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // normal
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // depth
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" }
                }
            ]
        });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "gBuffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                { // diffuse
                    binding: 0,
                    resource: this.gBufferTextureViews[0]
                },
                { // normal
                    binding: 1,
                    resource: this.gBufferTextureViews[1]
                },
                { // depth
                    binding: 2,
                    resource: this.gBufferTextureViews[2]
                }
            ]
        });

        // gbuffer writing pipeline
        this.gBufferWrittingPipeline = renderer.device.createRenderPipeline({
            label: "deferred write gBuffers pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "deferred write gBuffers pipeline layout",
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
                    label: "naive vert shader for deferred",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred write gBuffer frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    // albedo
                    { format: 'bgra8unorm' },
                    // normal
                    { format: 'rgba16float' }
                    
                ]
            }
        });

        // fullscreen pipeline
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            label: "deferred fullscreen pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "deferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred fullscreen frag shader",
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
        const clusteringEncoder = renderer.device.createCommandEncoder({ label: 'compute clustering encoder' });
        this.lights.doLightClustering(clusteringEncoder);
        // - run the G-buffer pass, outputting position, albedo, and normals
        const gBufferEncoder = renderer.device.createCommandEncoder({ label: 'deferred gBuffer encoder' });
        const gBufferPass = gBufferEncoder.beginRenderPass({
            colorAttachments: [
                { 
                    view: this.gBufferTextureViews[0],
                    clearValue: [0.0, 0.0, 1.0, 1.0],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
                { 
                    view: this.gBufferTextureViews[1],
                    clearValue: [0, 0, 0, 1],
                    loadOp: 'clear',
                    storeOp: 'store',
                }
            ],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
            
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
              },
        });
        gBufferPass.setPipeline(this.gBufferWrittingPipeline);
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
        renderer.device.queue.submit([gBufferEncoder.finish()]);

        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder({label:"deferred shading encoder"});
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const renderPass = encoder.beginRenderPass({
            label: "deferred render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        renderPass.setPipeline(this.fullscreenPipeline);
        renderPass.setBindGroup(0, this.sceneUniformsBindGroup);
        renderPass.setBindGroup(1, this.gBufferBindGroup);
        renderPass.draw(6);
        renderPass.end();
        renderer.device.queue.submit([encoder.finish()]);

    }
}
