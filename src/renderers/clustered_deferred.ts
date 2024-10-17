import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    gBufferTextures: {
        diffuseColor: GPUTexture;
        normal: GPUTexture;
    };
    gBufferTextureViews: {
        diffuseColor: GPUTextureView;
        normal: GPUTextureView;
    };
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        // 创建G-buffer纹理
        this.gBufferTextures = {
            diffuseColor: renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            }),
            normal: renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: 'rgba16float',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            }),
        };

        this.gBufferTextureViews = {
            diffuseColor: this.gBufferTextures.diffuseColor.createView(),
            normal: this.gBufferTextures.normal.createView()
        };

        // 创建深度纹理
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        // 创建场景uniform绑定组布局
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
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

        // 创建场景uniform绑定组
        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
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
                    resource: { buffer: this.lights.clusterBuffer }
                }
            ]
        });

        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'depth' }
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                
            ]
        });
        
        this.gBufferBindGroup = renderer.device.createBindGroup({
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.gBufferTextureViews.diffuseColor
                },
                {
                    binding: 1,
                    resource: renderer.device.createSampler()
                },
                {
                    binding: 2,
                    resource: this.gBufferTextureViews.normal
                },
                {
                    binding: 3,
                    resource: renderer.device.createSampler()
                },
                {
                    binding: 4,
                    resource: this.depthTextureView
                },
                {
                    binding: 5,
                    resource: renderer.device.createSampler()
                }
            ]
        });

        // 创建G-buffer渲染管线
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
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
                    code: shaders.clusteredDeferredFragSrc
                }),
                entryPoint: "main",
                targets: [
                    { format: 'rgba8unorm' },  // diffuse color
                    { format: 'rgba16float' }  // normal
                ]
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth32float"
            }
        });

        // 创建全屏渲染管线
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
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
                targets: [{ format: renderer.canvasFormat }]
            }
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
    
        // 运行聚类计算着色器
        this.lights.doLightClustering(encoder);
    
        // G-buffer渲染通道
        const gBufferPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.gBufferTextureViews.diffuseColor,
                    loadOp: "clear",
                    storeOp: "store",
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }
                },
                {
                    view: this.gBufferTextureViews.normal,
                    loadOp: "clear",
                    storeOp: "store",
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }
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
    
        // 全屏渲染通道
        const fullscreenPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: renderer.context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }
            }]
        });
    
        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        fullscreenPass.setBindGroup(1, this.gBufferBindGroup);
        fullscreenPass.draw(3);
        fullscreenPass.end();
    
        renderer.device.queue.submit([encoder.finish()]);
    }
}
