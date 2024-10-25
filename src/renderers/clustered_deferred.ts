import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    
    // declare the bind group layout for the scene
    scene_bind_group_layout: GPUBindGroupLayout;
    
    // declare the bind group for the scene
    scene_bind_group: GPUBindGroup;
    
    // declare the intermediate texture
    intermediate_texture: GPUTexture;
    
    // declare the intermediate texture view
    intermediate_texture_view: GPUTextureView;
    
    // declare the depth texture
    depth_texture: GPUTexture;
    
    // declare the depth texture view
    depth_texture_view: GPUTextureView;
    
    // declare the render pipeline layout
    render_pipeline_layout: GPUPipelineLayout;
    
    // declare the render pipeline vertex shader module
    render_pipeline_vertex_shader_module: GPUShaderModule;
    
    // declare the render pipeline fragment shader module
    render_pipeline_fragment_shader_module: GPUShaderModule;
    
    // declare the render pipeline
    render_pipeline: GPURenderPipeline;
    
    // declare the bind group layout for the present pipeline
    present_bind_group_layout: GPUBindGroupLayout;
    
    // declare the bind group for the present pipeline
    present_bind_group: GPUBindGroup;
    
    // declare the present pipeline layout
    present_pipeline_layout: GPUPipelineLayout;
    
    // declare the present pipeline vertex shader module
    present_pipeline_vertex_shader_module: GPUShaderModule;
    
    // declare the present pipeline fragment shader module
    present_pipeline_fragment_shader_module: GPUShaderModule;
    
    // declare the present pipeline
    present_pipeline: GPURenderPipeline;
    
    constructor(stage: Stage) {
        super(stage);
        
        // create the bind group layout for the scene
        this.scene_bind_group_layout = renderer.device.createBindGroupLayout({
            label: "scene_bind_group_layout",
            entries: [
                
                // create a new bind group layout entry for the camera's uniform buffer
                {
                    // specify the binding index
                    binding: 0,
                    
                    // specify the shader stage to be the vertex and fragment shader
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    
                    // specify the buffer type to be uniform
                    buffer: {
                        type: "uniform",
                    },
                },
            ],
        });
        
        // create the bind group for the scene
        this.scene_bind_group = renderer.device.createBindGroup({
            label: "scene_bind_group",
            layout: this.scene_bind_group_layout,
            entries: [
                
                // create a new bind group entry for the camera's uniform buffer
                {
                    // specify the binding index
                    binding: 0,
                    
                    // specify the resource to be the camera's uniform buffer
                    resource: {
                        buffer: this.camera.uniformsBuffer,
                    },
                },
            ],
        });
        
        // create the intermediate texture
        this.intermediate_texture = renderer.device.createTexture({
            label: "intermediate_texture",
            size: [
                renderer.canvas.width,
                renderer.canvas.height,
            ],
            format: "rgba32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        
        // create the intermediate texture view
        this.intermediate_texture_view = this.intermediate_texture.createView();
        
        // create the depth texture
        this.depth_texture = renderer.device.createTexture({
            label: "depth_texture",
            size: [
                renderer.canvas.width,
                renderer.canvas.height,
            ],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        
        // create the depth texture view
        this.depth_texture_view = this.depth_texture.createView();
        
        // create the render pipeline layout
        this.render_pipeline_layout = renderer.device.createPipelineLayout({
            label: "render_pipeline_layout",
            bindGroupLayouts: [
                this.scene_bind_group_layout,
                renderer.modelBindGroupLayout,
                renderer.materialBindGroupLayout,
            ],
        });
        
        // declare the render pipeline vertex shader module
        this.render_pipeline_vertex_shader_module = renderer.device.createShaderModule({
            label: "render_pipeline_vertex_shader_module",
            code: shaders.naiveVertSrc,
        });
        
        // declare the render pipeline fragment shader module
        this.render_pipeline_fragment_shader_module = renderer.device.createShaderModule({
            label: "render_pipeline_fragment_shader_module",
            code: shaders.clusteredDeferredFragSrc,
        });
        
        // create the render pipeline
        this.render_pipeline = renderer.device.createRenderPipeline({
            label: "render_pipeline",
            layout: this.render_pipeline_layout,
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
            vertex: {
                module: this.render_pipeline_vertex_shader_module,
                buffers: [
                    renderer.vertexBufferLayout,
                ],
            },
            fragment: {
                module: this.render_pipeline_fragment_shader_module,
                targets: [
                    {
                        format: "rgba32float",
                    },
                ],
            },
        });
        
        // create the bind group layout for the present pipeline
        this.present_bind_group_layout = renderer.device.createBindGroupLayout({
            label: "present_bind_group_layout",
            entries: [
                
                // create a new bind group layout entry for the camera's uniform buffer
                {
                    // specify the binding index
                    binding: 0,
                    
                    // specify the shader stage to be the vertex and fragment shader
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    
                    // specify the buffer type to be uniform
                    buffer: {
                        type: "uniform",
                    },
                },
                
                // create a new bind group layout entry for the intermediate texture
                {
                    // specify the binding index
                    binding: 1,
                    
                    // specify the shader stage to be the fragment shader
                    visibility: GPUShaderStage.FRAGMENT,
                    
                    // specify the texture type
                    texture: {
                        sampleType: 'unfilterable-float',
                    },
                },
                
                // create a new bind group layout entry for the intermediate texture sampler
                {
                    // specify the binding index
                    binding: 2,
                    
                    // specify the shader stage to be the fragment shader
                    visibility: GPUShaderStage.FRAGMENT,
                    
                    // specify the sampler type
                    sampler: {
                        type: 'non-filtering',
                    },
                },
                
                // create a new bind group layout entry for the depth texture
                {
                    // specify the binding index
                    binding: 3,
                    
                    // specify the shader stage to be the fragment shader
                    visibility: GPUShaderStage.FRAGMENT,
                    
                    // specify the texture type
                    texture: {
                        sampleType: 'unfilterable-float',
                    },
                },
                
                // create a new bind group layout entry for the light buffer
                {
                    // specify the binding index
                    binding: 4,
                    
                    // specify the shader stage to be the fragment shader
                    visibility: GPUShaderStage.FRAGMENT,
                    
                    // specify the buffer type to be read-only storage
                    buffer: {
                        type: "read-only-storage",
                    },
                },
            ],
        });
        
        // create the bind group for the present pipeline
        this.present_bind_group = renderer.device.createBindGroup({
            label: "present_bind_group",
            layout: this.present_bind_group_layout,
            entries: [
                
                // create a new bind group entry for the camera's uniform buffer
                {
                    // specify the binding index
                    binding: 0,
                    
                    // specify the resource to be the camera's uniform buffer
                    resource: {
                        buffer: this.camera.uniformsBuffer,
                    },
                },
                
                // create a new bind group entry entry for the intermediate texture
                {
                    // specify the binding index
                    binding: 1,
                    
                    // specify the resource
                    resource: this.intermediate_texture_view,
                },
                
                // create a new bind group entry entry for the intermediate texture sampler
                {
                    // specify the binding index
                    binding: 2,
                    
                    // specify the resource
                    resource: renderer.device.createSampler(),
                },
                
                // create a new bind group entry entry for the depth texture
                {
                    // specify the binding index
                    binding: 3,
                    
                    // specify the resource
                    resource: this.depth_texture_view,
                },
                
                // create a new bind group entry for the light buffer
                {
                    // specify the binding index
                    binding: 4,
                    
                    // specify the resource to be the light buffer
                    resource: {
                        buffer: this.lights.lightSetStorageBuffer,
                    },
                },
            ],
        });
        
        // create the present pipeline layout
        this.present_pipeline_layout = renderer.device.createPipelineLayout({
            label: "present_pipeline_layout",
            bindGroupLayouts: [
                this.present_bind_group_layout,
                this.lights.cluster_bind_group_layout,
            ],
        });
        
        // declare the present pipeline vertex shader module
        this.present_pipeline_vertex_shader_module = renderer.device.createShaderModule({
            label: "present_pipeline_vertex_shader_module",
            code: shaders.clusteredDeferredFullscreenVertSrc,
        });
        
        // declare the present pipeline fragment shader module
        this.present_pipeline_fragment_shader_module = renderer.device.createShaderModule({
            label: "present_pipeline_fragment_shader_module",
            code: shaders.clusteredDeferredFullscreenFragSrc,
        });
        
        // create the present pipeline
        this.present_pipeline = renderer.device.createRenderPipeline({
            label: "present_pipeline",
            layout: this.present_pipeline_layout,
            vertex: {
                module: this.present_pipeline_vertex_shader_module,
            },
            fragment: {
                module: this.present_pipeline_fragment_shader_module,
                targets: [
                    {
                        format: renderer.canvasFormat,
                    },
                ],
            },
        });
    }

    override draw() {
        
        // create a new command encoder
        const encoder = renderer.device.createCommandEncoder();
        
        // execute the compute shader
        this.lights.compute(encoder);
        
        // create the attachment view where the scene is rendered
        const attachment_view = renderer.context.getCurrentTexture().createView();
        
        // create and start the render pass
        const render_pass = encoder.beginRenderPass({
            label: "render_pass",
            colorAttachments: [
                {
                    view: this.intermediate_texture_view,
                    clearValue: [
                        0,
                        0,
                        0,
                        0,
                    ],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depth_texture_view,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });
        
        // bind the render pipeline
        render_pass.setPipeline(this.render_pipeline);
        
        // bind the scene's bind group to the render pass
        render_pass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.scene_bind_group
        );
        
        // bind additional shader resources and render
        this.scene.iterate(node => {
            
            // bind the model matrices
            render_pass.setBindGroup(
                shaders.constants.bindGroup_model,
                node.modelBindGroup
            );
        }, material => {
            
            // bind the textures and samplers
            render_pass.setBindGroup(
                shaders.constants.bindGroup_material,
                material.materialBindGroup
            );
        }, primitive => {
            
            // bind the vertex buffer
            render_pass.setVertexBuffer(
                0, primitive.vertexBuffer
            );
            
            // bind the index buffer
            render_pass.setIndexBuffer(
                primitive.indexBuffer, "uint32"
            );
            
            // render the primitive
            render_pass.drawIndexed(
                primitive.numIndices
            );
        });
        
        // end the render pass
        render_pass.end();
        
        // create and start the present pass
        const present_pass = encoder.beginRenderPass({
            label: "present_pass",
            colorAttachments: [
                {
                    view: attachment_view,
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        
        // bind the present pipeline
        present_pass.setPipeline(this.present_pipeline);
        
        // bind the present bind group to the present pass
        present_pass.setBindGroup(
            0, this.present_bind_group
        );
        
        // bind the clusters' bind group to the present pass
        present_pass.setBindGroup(
            1, this.lights.cluster_bind_group
        );
        
        // perform rendering
        present_pass.draw(6);
        
        // end the present pass
        present_pass.end();
        
        // submit the encoded commands
        renderer.device.queue.submit([
            encoder.finish(),
        ]);
    }
}
