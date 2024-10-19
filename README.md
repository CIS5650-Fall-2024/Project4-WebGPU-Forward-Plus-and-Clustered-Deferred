WebGL Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Kevin Dong
* Tested on: (TODO) **Google Chrome Version 129.0.6668.101** on
  Windows 11, i7-10750H @ 2.60GHz 16GB, RTX 2060

### Live Demo

[Link to Live Demo](https://kleokhov.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/)

### Demo Video/GIF

**Demo for 500 lights using Clustered Deferred Rendering**
![](img/img4.gif)

**Demo for 2500 lights using Clustered Deferred Rendering**
![](img/img3.gif)

### Forward Rendering
The forward rendering pipeline is implemented as the naive method. For each object in the scene, the renderer computes 
the shading by considering all the lights that affect it. This is the simplest method of rendering lights in a scene, 
but it is also the most computationally expensive because many lights do not affect many objects in the scene and are 
still rendered. It becomes very slow when the number of lights in the scene increases due to all the redundant light 
calculations.

### Forward+ Rendering
The forward plus rendering pipeline improves upon the forward rendering pipeline by incorporating a light culling 
mechanism.  It divides the view frustum into a grid of screen-space tiles or clusters. During a compute pass, it 
determines which lights affect each cluster by checking for overlaps between lights and clusters. When rendering the 
scene, the shader only considers the lights assigned to the cluster that a particular pixel belongs to. This change 
significantly improves the performance.

### Clustered Deferred Rendering
Clustered deferred rendering combines the benefits of deferred shading and clustered lighting. It breaks the rendering 
process into two stages: the G-buffer pass and the lighting pass. In the G-buffer pass, the renderer captures geometric 
information like positions, normals, and albedo into multiple textures. During the lighting pass, it computes lighting 
by reading from the G-buffer textures and considering only the lights relevant to each cluster. This method is more 
efficient than forward rendering because geometries are processed only once, and the number of lights considered per 
pixel is significantly reduced.

### Performance Analysis
#### Using 500 Lights
| Forward Rendering (Naive) | Forward+ Rendering       | Clustered Deferred Rendering |
|---------------------------|--------------------------|------------------------------|
| ![](img/naive.gif)        | ![](img/forwardPlus.gif) | ![](img/deferred.gif)        |

Performance Comparison between Forward, Forward+ and Clustered Deferred Rendering using 500 lights with
resolution 2148x1426.

When the number of lights is relatively small, for example, 500 lights, the performance difference between the forward+ 
rendering and the clustered deferred rendering is not very significant - as shown in the above images, they both can 
maintain a 60fps frame rate. The Forward rendering is much slower, having an average FPS of about 10.

|                              | Forward Rendering (Naive) | Forward+ Rendering | Clustered Deferred Rendering |
|------------------------------|---------------------------|--------------------|------------------------------|
| Average FPS using 500 lights | 10 FPS                    | 60 FPS             | 60 FPS                       |

#### Using 2500 Lights
| Forward Rendering (Naive) | Forward+ Rendering        | Clustered Deferred Rendering |
|---------------------------|---------------------------|------------------------------|
| ![](img/naive2.gif)       | ![](img/forwardPlus2.gif) | ![](img/deferred2.gif)       |

Performance Comparison between Forward, Forward+ and Clustered Deferred Rendering using 2500 lights with
resolution 2148x1426.

When the number of lights is increased to 2500, the performance difference between the forward+ rendering and the 
clustered deferred rendering becomes more apparent. The forward+ rendering only has about 20fps, while the clustered 
deferred rendering still maintains a 60fps frame rate. The forward rendering is much much slower, having an average FPS 
of about 1. From these comparison results, we can see that the clustered deferred rendering is the most efficient 
method for rendering scenes with a large number of lights.

|                               | Forward Rendering (Naive) | Forward+ Rendering | Clustered Deferred Rendering |
|-------------------------------|---------------------------|--------------------|------------------------------|
| Average FPS using 2500 lights |  1 FPS                    | 20 FPS             | 60 FPS                       |

### Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
- [light culling explained](https://www.aortiz.me/2018/12/21/CG.html)
- [example light culling code](https://github.com/Angelo1211/HybridRenderingEngine/blob/master/assets/shaders/ComputeShaders/clusterShader.comp)
- [an example about WebGPU texture](https://webgpufundamentals.org/webgpu/lessons/webgpu-textures.html)
- [WebGPU example](https://webgpu.github.io/webgpu-samples/?sample=texturedCube)
- [offset calculator](https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#)
