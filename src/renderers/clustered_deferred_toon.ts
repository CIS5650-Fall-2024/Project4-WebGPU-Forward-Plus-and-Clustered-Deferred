import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRendererToon extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    gBufferTextureBindGroupLayout: GPUBindGroupLayout;
    gBufferTextureBindGroup: GPUBindGroup;
    
    emptyBindGroupLayout: GPUBindGroupLayout;
    emptyBindGroup: GPUBindGroup;

    gBufferTexturePosition: GPUTexture;
    gBufferTextureAlbedo: GPUTexture;
    gBufferTextureNormal: GPUTexture;
    gBufferTextureShaded: GPUTexture;
    depthTexture: GPUTexture;

    gBufferTextureViews: GPUTextureView[];

    pipelinePre: GPURenderPipeline;
    pipelineFull: GPURenderPipeline;
    
    toonShadingComputeBindGroupLayout: GPUBindGroupLayout;
    toonShadingComputePipeline: GPUComputePipeline;

    constructor(stage: Stage) {
        super(stage);
        
        // GBuffer texture render targets
        this.gBufferTexturePosition = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float',
        });

        this.gBufferTextureAlbedo = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float',
        });

        this.gBufferTextureNormal = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float',
        });

        this.gBufferTextureShaded = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float',
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });

        this.gBufferTextureViews = [
            this.gBufferTexturePosition.createView(),
            this.gBufferTextureAlbedo.createView(),
            this.gBufferTextureNormal.createView(),
            this.gBufferTextureShaded.createView(),
        ];

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // cameraSet
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
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
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                }
            ]
        });

        this.gBufferTextureBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "gBuffer texture bind group layout",
            entries: [
                { // position
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                { // albedo
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                { // normal
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                }
            ]
        });

        this.gBufferTextureBindGroup = renderer.device.createBindGroup({
            label: "gBuffer texture bind group",
            layout: this.gBufferTextureBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.gBufferTextureViews[0],
                },
                {
                    binding: 1,
                    resource: this.gBufferTextureViews[1]
                },
                {
                    binding: 2,
                    resource: this.gBufferTextureViews[2]
                }
            ]
        });

        this.emptyBindGroupLayout = renderer.device.createBindGroupLayout({
            entries: []
        });

        this.emptyBindGroup = renderer.device.createBindGroup({
            layout: this.emptyBindGroupLayout,
            entries: []
        });

        this.pipelinePre = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "clustered deferred prepass pipeline layout",
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
                    label: "clustered deferred prepass frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: "rgba16float",
                    },
                    {
                        format: "rgba16float",
                    },
                    {
                        format: "rgba16float",
                    }
                ]
            }
        });
        
        this.pipelineFull = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "clustered deferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.emptyBindGroupLayout,
                    this.emptyBindGroupLayout,
                    this.gBufferTextureBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred fullscreen frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: "rgba16float",
                    }
                ]
            }
        });

        this.toonShadingComputeBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "toon shading compute bind group layout",
            entries: [
                { // toon shading
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: {}
                },
                { // canvas color
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        format: shaders.constants.presentationFormat,
                    }
                },
            ]
        });

        this.toonShadingComputePipeline = renderer.device.createComputePipeline({
            label: "toon shading compute pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "toon shading compute pipeline layout",
                bindGroupLayouts: [ this.toonShadingComputeBindGroupLayout ]
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "toon shading compute shader",
                    code: shaders.toonShadingComputeSrc
                }),
                entryPoint: "main"
            }
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        this.lights.doLightClustering(encoder);

        const renderPassPre = encoder.beginRenderPass({
            label: "clustered deferred pre render pass",
            colorAttachments: [
                {
                    view: this.gBufferTextureViews[0],
            
                    clearValue: [0, 0, 0, 0],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
                {
                    view: this.gBufferTextureViews[1],
            
                    clearValue: [0, 0, 0, 0],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
                {
                    view: this.gBufferTextureViews[2],
            
                    clearValue: [0, 0, 0, 0],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }, 
            ...(renderer.canTimestamp && {
                timestampWrites: {
                    querySet: this.querySet,
                    beginningOfPassWriteIndex: 0,
                    endOfPassWriteIndex: 1,
                },
            }),
        });
        renderPassPre.setPipeline(this.pipelinePre);

        renderPassPre.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            renderPassPre.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            renderPassPre.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            renderPassPre.setVertexBuffer(0, primitive.vertexBuffer);
            renderPassPre.setIndexBuffer(primitive.indexBuffer, 'uint32');
            renderPassPre.drawIndexed(primitive.numIndices);
        });

        renderPassPre.end();

        const renderPassFull = encoder.beginRenderPass({
            label: "clustered deferred full render pass",
            colorAttachments: [
                {
                    view: this.gBufferTextureViews[3],
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }, 
            ...(renderer.canTimestamp && {
                timestampWrites: {
                    querySet: this.querySet,
                    beginningOfPassWriteIndex: 2,
                    endOfPassWriteIndex: 3,
                },
            }),
        });

        renderPassFull.setPipeline(this.pipelineFull);

        renderPassFull.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        renderPassFull.setBindGroup(1, this.emptyBindGroup);
        renderPassFull.setBindGroup(2, this.emptyBindGroup);
        renderPassFull.setBindGroup(shaders.constants.bindGroup_deferred, this.gBufferTextureBindGroup);

        renderPassFull.draw(6);
        
        renderPassFull.end();
        
        const toonShadingComputeBindGroup = renderer.device.createBindGroup({
            label: "toon shading compute bind group",
            layout: this.toonShadingComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.gBufferTextureViews[3]
                },
                {
                    binding: 1,
                    resource: canvasTextureView
                }
            ]
        });

        const computePass = encoder.beginComputePass();

        computePass.setPipeline(this.toonShadingComputePipeline);

        computePass.setBindGroup(0, toonShadingComputeBindGroup);

        computePass.dispatchWorkgroups(renderer.canvas.width, renderer.canvas.height);

        computePass.end();

        if (renderer.canTimestamp) {
            encoder.resolveQuerySet(this.querySet, 0, this.querySet.count, this.resolveBuffer, 0);
            if (this.resultBuffer.mapState === 'unmapped') {
                encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.resultBuffer, 0, this.resultBuffer.size);
            }
        }

        renderer.device.queue.submit([encoder.finish()]);

        if (renderer.canTimestamp && this.resultBuffer.mapState === 'unmapped') {
            this.resultBuffer.mapAsync(GPUMapMode.READ).then(() => {
                const times = new BigInt64Array(this.resultBuffer.getMappedRange());
                this.gpuTime = (Number(times[3] - times[2] + times[1] - times[0])) * 0.000001;
                if (this.gpuTimesIndex < this.gpuTimesSize && 
                    this.gpuTimes[this.gpuTimesIndex] != this.gpuTime &&
                    this.gpuTime > 0) {
                    this.gpuTimes[this.gpuTimesIndex] = this.gpuTime;
                    this.gpuTimesIndex++;
                } 
                this.resultBuffer.unmap();
            });
        }

        if (this.gpuTimesIndex == this.gpuTimesSize) {
            console.log(this.gpuTimes);
            this.gpuTimesIndex++;
        }
    }
}
