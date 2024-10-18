import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    gbufferBindGroupLayout: GPUBindGroupLayout;
    gbufferBindGroup: GPUBindGroup;
    gbufferOptimBindGroupLayout: GPUBindGroupLayout;
    gbufferOptimBindGroup: GPUBindGroup;

    depthVisualGroupLayout: GPUBindGroupLayout;
    depthVisualBindGroup: GPUBindGroup;
    depthSampler: GPUSampler;

    emptyBindGroupLayout: GPUBindGroupLayout;
    emptyBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    posTexture: GPUTexture;
    posTextureView: GPUTextureView;
    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;
    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;
    gbufferTexture: GPUTexture;
    gbufferTextureView: GPUTextureView;
    testTexture: GPUTexture;
    testTextureView: GPUTextureView;
    defaultSampler: GPUSampler;

    // depthbufferPipeline: GPURenderPipeline;
    // depthbufferVisualPipeline: GPURenderPipeline;
    renderPipeline: GPURenderPipeline;
    renderOptimPipeline: GPURenderPipeline;
    gbufferPipeline: GPURenderPipeline;
    gbufferOptimPipeline: GPURenderPipeline;

    gbufferBundle: GPURenderBundle;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        // Create the scene uniforms bind group layout
        {
            this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
                label: "cluster forward defferred scene uniforms bind group layout",
                entries: [
                    { // projection buffer
                        binding: 0,
                        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                        buffer: { type: "uniform" }
                    },
                    { // view buffer
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                        buffer: { type: "uniform" }
                    },
                    { // lightSet
                        binding: 2,
                        visibility: GPUShaderStage.FRAGMENT,
                        buffer: { type: "read-only-storage" }
                    },
                    { // cluster bounds
                        binding: 3,
                        visibility: GPUShaderStage.FRAGMENT,
                        buffer: { type: "storage" }
                    },
                    { // cluster lights
                        binding: 4,
                        visibility: GPUShaderStage.FRAGMENT,
                        buffer: { type: "storage" }
                    }
                ]
            });

            this.sceneUniformsBindGroup = renderer.device.createBindGroup({
                label: "cluster forward defferred scene uniforms bind group",
                layout: this.sceneUniformsBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: this.camera.uniformsBuffer }
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.camera.viewUniformBuffer }
                    },
                    {
                        binding: 2,
                        resource: { buffer: this.lights.lightSetStorageBuffer }
                    },
                    {
                        binding: 3,
                        resource: { buffer: this.lights.clusterBoundBuffer   }
                    },
                    {
                        binding: 4,
                        resource: { buffer: this.lights.clusterLightsBuffer }
                    }
                ]
            });

            this.emptyBindGroupLayout = renderer.device.createBindGroupLayout({
                entries: [] // place holder
            });

            this.emptyBindGroup = renderer.device.createBindGroup({
                layout: this.emptyBindGroupLayout,
                entries: [] // place holder
            });
        }

        // Create depth texture & G-buffer 
        {
            this.depthTexture = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: "depth24plus",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            });
            this.depthTextureView = this.depthTexture.createView();

            this.depthSampler = renderer.device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge'
            });

            this.posTexture = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: "rgba16float",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            });
            this.posTextureView = this.posTexture.createView();

            this.normalTexture = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: "rgba16float",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            });
            this.normalTextureView = this.normalTexture.createView();

            this.albedoTexture = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: "rgba16float",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            });
            this.albedoTextureView = this.albedoTexture.createView();

            this.defaultSampler = renderer.device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge'
            });

            this.testTexture = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: 'rgba32float', 
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
            this.testTextureView = this.testTexture.createView();

            this.gbufferTexture = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: "rgba32uint",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            });
            this.gbufferTextureView = this.gbufferTexture.createView();
        }

        // Create the gbuffer bind group layout
        {
            this.gbufferBindGroupLayout = renderer.device.createBindGroupLayout({
                label: "cluster forward defferred gbuffer bind group layout",
                entries: [
                    { // sampler
                        binding: 0,
                        visibility: GPUShaderStage.FRAGMENT,
                        sampler: {}
                    },
                    { // position
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {
                            sampleType: "float",
                            viewDimension: '2d'
                        }
                    },
                    { // normal
                        binding: 2,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {
                            sampleType: "float",
                            viewDimension: '2d'
                        }
                    },
                    { // albedo
                        binding: 3,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {
                            sampleType: "float",
                            viewDimension: '2d'
                        }
                    },
                    { 
                        // depth
                        binding: 4,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {
                            sampleType: 'depth',
                            viewDimension: '2d',
                        }
                    },
                ]
            });

            this.gbufferBindGroup = renderer.device.createBindGroup({
                layout: this.gbufferBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: this.defaultSampler
                    },
                    {
                        binding: 1,
                        resource: this.posTextureView
                    },
                    {
                        binding: 2,
                        resource: this.normalTextureView
                    },
                    {
                        binding: 3,
                        resource: this.albedoTextureView
                    },
                    {
                        binding: 4,
                        resource: this.depthTextureView
                    }
                ]
            });

            this.gbufferOptimBindGroupLayout = renderer.device.createBindGroupLayout({
                label: "cluster forward defferred optimized gbuffer bind group layout",
                entries: [
                    { // sampler
                        binding: 0,
                        visibility: GPUShaderStage.FRAGMENT,
                        sampler: {}
                    },
                    { // packed gbuffer
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {
                            sampleType: "uint",
                            viewDimension: '2d'
                        }
                    },
                ]
            });

            this.gbufferOptimBindGroup = renderer.device.createBindGroup({
                layout: this.gbufferOptimBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: this.defaultSampler
                    },
                    {
                        binding: 1,
                        resource: this.gbufferTextureView
                    },
                ]
            });
        }

        // Create the pipelines
        {
            this.gbufferPipeline = renderer.device.createRenderPipeline({
                layout: renderer.device.createPipelineLayout({
                    label: "cluster forward defferred gbuffer pipeline layout",
                    bindGroupLayouts: [
                        this.sceneUniformsBindGroupLayout,
                        renderer.modelBindGroupLayout,
                        renderer.materialBindGroupLayout,
                    ]
                }),
                vertex: {
                    module: renderer.device.createShaderModule({
                        code: shaders.naiveVertSrc
                    }),
                    buffers: [ renderer.vertexBufferLayout ],
                    entryPoint: "main"
                },
                fragment: {
                    module: renderer.device.createShaderModule({
                        code: shaders.clusteredDeferredFragSrc
                    }),
                    entryPoint: "main",
                    targets: [
                        {
                            format: "rgba16float"
                        },
                        {
                            format: "rgba16float"
                        },
                        {
                            format: "rgba16float"
                        },
                    ]
                },
                primitive: {
                    topology: "triangle-list"
                },
                depthStencil: {
                    format: "depth24plus",
                    depthWriteEnabled: true,
                    depthCompare: "less"
                }
            });

            this.gbufferOptimPipeline = renderer.device.createRenderPipeline({
                layout: renderer.device.createPipelineLayout({
                    label: "cluster forward defferred gbuffer optimization pipeline layout",
                    bindGroupLayouts: [
                        this.sceneUniformsBindGroupLayout,
                        renderer.modelBindGroupLayout,
                        renderer.materialBindGroupLayout,
                    ]
                }),
                vertex: {
                    module: renderer.device.createShaderModule({
                        code: shaders.naiveVertSrc
                    }),
                    buffers: [ renderer.vertexBufferLayout ],
                    entryPoint: "main"
                },
                fragment: {
                    module: renderer.device.createShaderModule({
                        code: shaders.clusteredDeferredOptimFragSrc
                    }),
                    entryPoint: "main",
                    targets: [
                        {
                            format: "rgba32uint"
                        },
                    ]
                },
                primitive: {
                    topology: "triangle-list"
                },
                depthStencil: {
                    format: "depth24plus",
                    depthWriteEnabled: true,
                    depthCompare: "less"
                }
            });

            this.renderPipeline = renderer.device.createRenderPipeline({
                layout: renderer.device.createPipelineLayout({
                    label: "cluster forward defferred render pipeline layout",
                    bindGroupLayouts: [
                        this.sceneUniformsBindGroupLayout,
                        this.emptyBindGroupLayout,
                        this.emptyBindGroupLayout,
                        this.gbufferBindGroupLayout
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
                },
                primitive: {
                    topology: "triangle-list"
                }
            });

            this.renderOptimPipeline = renderer.device.createRenderPipeline({
                layout: renderer.device.createPipelineLayout({
                    label: "cluster forward defferred optimized render pipeline layout",
                    bindGroupLayouts: [
                        this.sceneUniformsBindGroupLayout,
                        this.emptyBindGroupLayout,
                        this.emptyBindGroupLayout,
                        this.gbufferOptimBindGroupLayout
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
                        code: shaders.clusteredDeferredOptimFullscreenFragSrc
                    }),
                    entryPoint: "main",
                    targets: [
                        {
                            format: renderer.canvasFormat
                        }
                    ]
                },
                primitive: {
                    topology: "triangle-list"
                }
            });
        }

        // Create the render bundle
        {
            // render pass bundles
            const renderBundleEncoder = renderer.device.createRenderBundleEncoder({
                colorFormats: ["rgba16float", "rgba16float", "rgba16float"],
                depthStencilFormat: 'depth24plus',
            });

            renderBundleEncoder.setPipeline(this.gbufferPipeline);
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
            this.gbufferBundle = renderBundleEncoder.finish();
        }
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // - run the clustering compute shader
        {
            this.lights.doLightClustering(encoder);
        }
        // - run the G-buffer pass, outputting position, albedo, and normals
        {
            var gbufferPass: GPURenderPassEncoder;
            if(renderer.useGbufferCompression)
            {
                gbufferPass = encoder.beginRenderPass({
                    label: "cluster forward defferred optimized gbuffer render pass",
                    colorAttachments: [
                        {
                            view: this.gbufferTextureView,
                            loadOp: "clear",
                            storeOp: "store",
                            clearValue: { r: 0, g: 0, b: 0, a: 0 }
                        }
                    ],
                    depthStencilAttachment: {
                        view: this.depthTextureView,
                        depthLoadOp: "clear",
                        depthStoreOp: "store",
                        depthClearValue: 1.0
                    }
                });
            }
            else
            {
                gbufferPass = encoder.beginRenderPass({
                    label: "cluster forward defferred gbuffer render pass",
                    colorAttachments: [
                        {
                            view: this.posTextureView,
                            loadOp: "clear",
                            storeOp: "store",
                            clearValue: { r: 0, g: 0, b: 0, a: 0 }
                        },
                        {
                            view: this.normalTextureView,
                            loadOp: "clear",
                            storeOp: "store",
                            clearValue: { r: 0, g: 0, b: 0, a: 0 }
                        },
                        {
                            view: this.albedoTextureView,
                            loadOp: "clear",
                            storeOp: "store",
                            clearValue: { r: 0, g: 0, b: 0, a: 0 }
                        }
                    ],
                    depthStencilAttachment: {
                        view: this.depthTextureView,
                        depthLoadOp: "clear",
                        depthStoreOp: "store",
                        depthClearValue: 1.0
                    }
                });
            }

            if(renderer.useRenderBundles)
            {
                gbufferPass.executeBundles([this.gbufferBundle]);
            }
            else
            {
                if(renderer.useGbufferCompression)
                {
                    gbufferPass.setPipeline(this.gbufferOptimPipeline);
                }
                else
                {
                    gbufferPass.setPipeline(this.gbufferPipeline);
                }
                gbufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
                this.scene.iterate(node => {
                    gbufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
                }, material => {
                    gbufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
                }, primitive => {
                    gbufferPass.setVertexBuffer(0, primitive.vertexBuffer);
                    gbufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                    gbufferPass.drawIndexed(primitive.numIndices);
                });
            }
            gbufferPass.end();
        }
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        {
            const renderPass = encoder.beginRenderPass({
                label: "cluster deferred render pass",
                colorAttachments: [
                    {
                        view: renderer.useBloom ? this.screenTextureView : canvasTextureView,
                        clearValue: [0, 0, 0, 0],
                        loadOp: "clear",
                        storeOp: "store"
                    }
                ]
            });

            renderPass.setPipeline(renderer.useGbufferCompression ? this.renderOptimPipeline : this.renderPipeline);
            renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
            renderPass.setBindGroup(1, this.emptyBindGroup);
            renderPass.setBindGroup(2, this.emptyBindGroup);
            renderPass.setBindGroup(shaders.constants.bindGroup_Gbuffer, renderer.useGbufferCompression ? this.gbufferOptimBindGroup : this.gbufferBindGroup);
            renderPass.draw(3);
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
