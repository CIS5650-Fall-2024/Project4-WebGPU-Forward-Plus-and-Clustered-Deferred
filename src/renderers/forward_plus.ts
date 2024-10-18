import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthVisualGroupLayout: GPUBindGroupLayout;
    depthVisualBindGroup: GPUBindGroup;
    depthSampler: GPUSampler;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    testTexture: GPUTexture;
    testTextureView: GPUTextureView;

    preDepthPipeline: GPURenderPipeline;
    depthbufferVisualPipeline: GPURenderPipeline;
    renderPipeline: GPURenderPipeline;

    preDepthBundle: GPURenderBundle;
    renderBundle: GPURenderBundle;

    constructor(stage: Stage) {
        super(stage);

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here

        // Create the scene uniforms bind group layout
        {
            this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
                label: "forward plus scene uniforms bind group layout",
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
                label: "forward plus scene uniforms bind group",
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
        }

        // Create depth texture & textureView
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

            this.testTexture = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: 'rgba32float', 
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
            this.testTextureView = this.testTexture.createView();
        }

        // 1. Create the depth pre-pass pipeline
        {
            this.preDepthPipeline = renderer.device.createRenderPipeline({
                layout: renderer.device.createPipelineLayout({
                    label: "depth pre-pass pipeline layout",
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
                        label: "depth pre-pass vert shader",
                        code: shaders.naiveVertSrc
                    }),
                    buffers: [renderer.vertexBufferLayout]
                },
                fragment: {
                    module: renderer.device.createShaderModule({
                        label: "depth pre-pass frag shader",
                        code: shaders.preDepthFragSrc,
                    }),
                    targets: [
                        {
                            format: renderer.canvasFormat,
                            writeMask: 0 // No color writes
                        }
                    ]
                }
                // No fragment shader or color targets
            });
        }

        // 2. The cluster compute pipeline will be created in Light
        {

        }

        // 3. Render pipeline
        {
            this.renderPipeline = renderer.device.createRenderPipeline({
                layout: renderer.device.createPipelineLayout({
                    label: "forward plus render pipeline layout",
                    bindGroupLayouts: [
                        this.sceneUniformsBindGroupLayout,
                        renderer.modelBindGroupLayout,
                        renderer.materialBindGroupLayout
                    ]
                }),
                depthStencil: {
                    depthWriteEnabled: true,
                    depthCompare: "less-equal",
                    format: "depth24plus"
                },
                vertex: {
                    module: renderer.device.createShaderModule({
                        label: "forward plus vert shader",
                        code: shaders.naiveVertSrc
                    }),
                    buffers: [ renderer.vertexBufferLayout ]
                },
                fragment: {
                    module: renderer.device.createShaderModule({
                        label: "forward plus frag shader",
                        code: shaders.forwardPlusFragSrc,
                    }),
                    targets: [
                        {
                            format: renderer.canvasFormat,
                        }
                    ]
                }
            });
        }

        // Render Bundles
        {
            // pre depth pass bundles
            const preDepthBundleEncoder = renderer.device.createRenderBundleEncoder({
                colorFormats: [renderer.canvasFormat],
                depthStencilFormat: 'depth24plus',
            });

            preDepthBundleEncoder.setPipeline(this.preDepthPipeline);
            preDepthBundleEncoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
            this.scene.iterate(node => {
                preDepthBundleEncoder.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
            }, material => {
                preDepthBundleEncoder.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
            }, primitive => {
                preDepthBundleEncoder.setVertexBuffer(0, primitive.vertexBuffer);
                preDepthBundleEncoder.setIndexBuffer(primitive.indexBuffer, 'uint32');
                preDepthBundleEncoder.drawIndexed(primitive.numIndices);
            });
            this.preDepthBundle = preDepthBundleEncoder.finish();

            // render pass bundles
            const renderBundleEncoder = renderer.device.createRenderBundleEncoder({
                colorFormats: [renderer.canvasFormat],
                depthStencilFormat: 'depth24plus',
            });

            renderBundleEncoder.setPipeline(this.renderPipeline);
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

        // For debug
        // {
        //     this.depthVisualGroupLayout = renderer.device.createBindGroupLayout({
        //         label: "depth visualization bind group layout",
        //         entries: [
        //             { 
        //                 binding: 0,
        //                 visibility: GPUShaderStage.FRAGMENT,
        //                 texture: {
        //                     sampleType: 'depth',
        //                     viewDimension: '2d',
        //                 }
        //             },
        //             { 
        //                 binding: 1,
        //                 visibility: GPUShaderStage.FRAGMENT,
        //                 sampler: {}
        //             }
        //         ]
        //     });

        //     this.depthVisualBindGroup = renderer.device.createBindGroup({
        //         label: "depth visualizatio bind group",
        //         layout: this.depthVisualGroupLayout,
        //         entries: [
        //             {
        //                 binding: 0,
        //                 resource: this.depthTextureView
        //             },
        //             {
        //                 binding: 1,
        //                 resource: this.depthSampler
        //             }
        //         ]
        //     });

        //     this.depthbufferVisualPipeline = renderer.device.createRenderPipeline({
        //         layout: renderer.device.createPipelineLayout({
        //             label: "forward plus depth visualization pipeline layout",
        //             bindGroupLayouts: [
        //                 this.depthVisualGroupLayout,
        //             ]
        //         }),
        //         vertex: {
        //             module: renderer.device.createShaderModule({
        //                 label: "forward plus depth visualization vert shader",
        //                 code: shaders.depthVisualVertSrc,
        //             }),
        //             //buffers: [ renderer.vertexBufferLayout ]
        //         },
        //         fragment: {
        //             module: renderer.device.createShaderModule({
        //                 label: "forward plus depth visualization  shader",
        //                 code: shaders.depthVisualFragSrc,
        //             }),
        //             targets: [
        //                 {
        //                     format: renderer.canvasFormat,
        //                     //format: 'rgba32float',
        //                 }
        //             ]
        //         }
        //     });
        // }
    }

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // 1. Pre-Depth Pass
        {
            const depthPrePass = encoder.beginRenderPass({
                label: "forward plus depth-only render pass",
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
            
            if(renderer.useRenderBundles)
            {
                depthPrePass.executeBundles([this.preDepthBundle]);
                // console.log('4444444');
            }
            else
            {
                depthPrePass.setPipeline(this.preDepthPipeline);
                depthPrePass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

                this.scene.iterate(node => {
                    depthPrePass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
                }, material => {
                    depthPrePass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
                }, primitive => {
                    depthPrePass.setVertexBuffer(0, primitive.vertexBuffer);
                    depthPrePass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                    depthPrePass.drawIndexed(primitive.numIndices);
                });
                // console.log('5555555');
            }
            depthPrePass.end();
        }

        // 2. Cluster Compute Pass
        {
            this.lights.doLightClustering(encoder);
        }

        // 3. Main Render Pass
        {
            const renderPass = encoder.beginRenderPass({
                label: "forward plus render pass",
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
                    depthLoadOp: "load",
                    depthStoreOp: "store",
                }
            });

            if(renderer.useRenderBundles)
            {
                renderPass.executeBundles([this.renderBundle]);
                // console.log('11111');
            }
            else
            {
                renderPass.setPipeline(this.renderPipeline);
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

        //For debug tex visualization pass
        // {
        //     const depthVisualPass = encoder.beginRenderPass({
        //         label: "forward plus render pass",
        //         colorAttachments: [
        //             {
        //                 view: canvasTextureView,
        //                 clearValue: [0, 0, 0, 0],
        //                 loadOp: "clear",
        //                 storeOp: "store"
        //             }
        //         ]
        //     });
        //     depthVisualPass.setPipeline(this.depthbufferVisualPipeline);
        //     depthVisualPass.setBindGroup(0, this.depthVisualBindGroup);
        //     depthVisualPass.draw(3);
        //     depthVisualPass.end();
        // }

        renderer.device.queue.submit([encoder.finish()]);

        //console.log("Forward+ draw");
    }
}
