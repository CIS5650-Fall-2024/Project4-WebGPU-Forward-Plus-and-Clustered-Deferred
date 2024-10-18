<img width="999" alt="image" src="https://github.com/user-attachments/assets/c2c60221-5e59-4312-a9f0-2a1c348ec68b">

WebGPU Forward+ and Clustered Deferred Shading
==============================================

## 🚀 Overview

> University of Pennsylvania, CIS 5650: GPU Programming and Architecture, Project 4 - WebGPU Clustered Renderer
> * Michael Mason
>   + [Personal Website](https://www.michaelmason.xyz/)
> * Tested on: Windows 11, Ryzen 9 5900HS @ 3.00GHz 16GB, RTX 3080 (Laptop) 8192MB

This is a *[clustered deferred renderer](https://www.aortiz.me/2018/12/21/CG.html)* implemented in [WebGPU](https://github.com/gpuweb/gpuweb), an explicit GPU API for the web.   

The goal of this 1.5-week project was to:

* Learn the ***WebGPU API*** and develop a better understanding of explicit APIs.
* Understand ***clustered shading***, which involves splitting up the camera frustum into bounding "clusters", and assign the lights from the scene to them.
* Understand ***deferred shading***, which involves splitting rendering in to a "G-Buffer" render pass and a "Full-screen" lighting render pass.
  + ***"G-Buffer" geometry pass:*** process the geometry data and output seperate position, normal and albedo framebuffers
  + ***"Full-screen" Lighting pass:*** using the framebuffers from the last pass, calculate the lighting for each pixel.


### 🎮 Live Demo

[See Live Demo Here! (WebGPU Supported Browsers Only)](https://micklemacklemore.github.io/WebGPU-Deferred-Renderer/)

### 📺 Demo Video

https://github.com/user-attachments/assets/cfd5b4da-c825-4aac-a5a3-9921906e8ecb

## 🤹‍♂️ Performance Analysis

### 👨‍🔬 Explanation of Clustered and Deferred Implementations

In my performance analysis I will discuss and compare (in the **[Results](#-results)** section) three methods of rendering, which this project implements. 

#### 1️⃣ Naive Forward Rendering

This is a basic naive forward renderer with none of the optimizations. The geometry and lighting is processed in a single rendering pass. 
In the fragment shader, we niavely iterate through every light in the scene to determine the total light contribution of each fragment in the scene, regardless of whether a light is actually close enough to the fragment to make any sort of light contribution.

This psuedo-code illustrates it well:

```psuedo
//Shaders:
Shader simpleShader

//Buffers:
Buffer display

for mesh in scene
    for light in scene
        display += simpleShader(mesh, light)
```

For scenes with a lot of lights up to 5000, this scales up very quickly. Clustered shading, as explained in the next section, helps with this significantly. 

#### 2️⃣ Clustered Rendering ("Forward+")

In the "Forward+" renderer, clustered rendering is introduced. 

Clustered rendering optimizes rendering by limiting how many lights we iterate per fragment, and this is done by putting the lights into a spatial data structure of 3D cells (called "clusters"). 

Since we're only concerned with what is viewable, we limit the extent of these cells to the camera's view frustum: 

<div align="center">
  <br>
  <img src="https://github.com/user-attachments/assets/0ba26f95-7cc2-4c57-81a4-bc3edda4ad34">
  <p><i>Top-down view of camera frustum in our 3D scene (Source: https://www.aortiz.me/2018/12/21/CG.html#clustered-shading)</i></p>
  <br>
</div>

The total amount of times we subdivide the frustum into 3D clusters seems to be varied across implementations of this algorithm, and I compare different configurations in [a section below.](#varying-cluster-size)

I use **16x9x24** (that is, 16 divisions in X view-space direction, 9 divisions in the Y view-space direction, 24 divisions in the Z view-space direction) as default for my implementation to match the configuration used in [Doom 2016](https://advances.realtimerendering.com/s2016/Siggraph2016_idTech6.pdf). Which seems to be a good configuration that matches the aspect ratio of most PC monitors. 

What also seems to vary in this algorithm is how to distribute the cluster divisions in the Z view-space direction:

<div align="center">
  <br>
  <img src="https://github.com/user-attachments/assets/47875c71-d32f-45c6-aa0c-2ca4a2e334ff" height=200px>
  <img src="https://github.com/user-attachments/assets/df87cb5e-ffd1-490d-ba86-0f7535a2db38" height=200px>
  <p><i>Linear scaling vs Logarithmic scaling. (source: https://www.aortiz.me/2018/12/21/CG.html#clustered-shading)</i></p>
  <br>
</div>

The niave method is dividing the z-depth in NDC space (image on the left). This seems to unevenly distribute the majority of clusters towards the camera's near plane, which is ultimately
unhelpful as the majority of lights will end up being placed in in the clusters closer to the far-plane. 

Ultimately it would be best to uniformly distribute lights across the clusters, so there is a general understanding that logarithmically scaling the z-depth divisions is necessary (as shown in the image on the right). 
In a [SIGGRAPH 2016 Real-Time Rendering Talk for Doom 2016](https://advances.realtimerendering.com/s2016/Siggraph2016_idTech6.pdf), they presented a fairly simple subdivision scheme that I decided to use, and which seems to work pretty well: 

<div align="center">
  <br>
  <img src="https://github.com/user-attachments/assets/343a3786-39a8-41d3-84c2-40e409ec56f6">
  <p><i>Slide 5 of the <a href="https://advances.realtimerendering.com/s2016/Siggraph2016_idTech6.pdf">DOOM 2016 presentation.</a></i></p>
  <br>
</div>

#### Cluster Visualisation!

<div align="center">
  <br>
  <img src="https://github.com/user-attachments/assets/f6d9225a-1a49-4a76-a233-5c432890e0d5" height=400px>
  <img src="https://github.com/user-attachments/assets/9e1f6271-c321-4b73-a874-ef552e0175da" height=400px>
  <p><i>First: Each cluster assigned a random color. Second: Each cluster assigned a random color (only in the Z direction)</i></p>
  <br>
</div>


#### 3️⃣ Clustered + Deferred Rendering

For this renderer, we add the additional optimisation of seperating rendering into a geometry pass and a lighting pass. This is known as [Deferred Shading](https://learnopengl.com/Advanced-Lighting/Deferred-Shading). 

A visual example of deferred shading provided in the image below. A geometry pass may output relevant information such as world-space position, normals, color/albedo and specular (for PBR-based rendering). Then the lighting pass can perform calculations based on the "G-buffer" provided.  

<div align="center">
  <br>
  <img src="https://github.com/user-attachments/assets/b6ae78e3-2b15-4761-96b0-3fc9442ce6de" height=400px>
  <p><i>Source: https://learnopengl.com/Advanced-Lighting/Deferred-Shading</i></p>
  <br>
</div>

In our specific implementation, the geometry pass outputs a world-space position pass (`16-bit float RGBA` channels per pixel), a normal pass (`16-bit float RGBA` channels per pixel) and a color/albedo pass (`8-bit unsigned integer` channels per pixel).

There are many ways to implement deferred rendering depending on what you need in your G-Buffer, and more optimized deferred renderers will limit the amount of data in their G-buffer to minimize bandwidth between render-passes. (As an example, as an alternative to a world position pass, we may only need to store the z-depth instead, 
and calculate the world position in our lighting render pass). 

The major advantage of deferred rendering is that, since the geometry render pass performs the initial depth-testing of the geometry, the lighting pass is only concerned with fragments that are viewable to the screen. Less fragments to test increases the efficiency of the lighting stage significantly. 

### 📊 Results

Three types of tests (Varying Light Counts, Cluster Sizes and Workgroup Sizes) were performed to test the performance of each renderer and is outlined here. 

For these tests, we measure performance by *milliseconds per frame* and we inspect the rolling average that is calculated by [WebGPU Inspector](https://github.com/brendan-duncan/webgpu_inspector). It's unclear over how many frames the rolling average is taken by WebGPU Inspector, but it seemed to be a simple and reliable enough metric for comparing the rendering implementations. 

> [!NOTE]
> It appears from the code that WebGPU Inspector takes a rolling average of the [last 60 frames.](https://github.com/brendan-duncan/webgpu_inspector/blob/414532fe742ba19943d20acadca050fce23275ed/src/webgpu_inspector.js#L55)
> This is inspected and recorded visually from the UI. 

#### Varying Light Counts

Clearly, as seen from the graph below, the naive approach scales *very poorly* with the increase in number of lights. The time per frame increases dramatically as the number of lights increases, from 293 ms at 500 lights to 3,020 ms at 5,000 lights. This exponential rise in computation time is expected in naive forward shading because each light is processed for every fragment without optimization, making the approach inefficient as the light count grows.

Forward+ performs significantly better than Naive Forward Shading across all light counts. The increase in time per frame is much more gradual compared to the naive approach, going from 25 ms at 500 lights to 190 ms at 5,000 lights. It seems that pre-assigning lights to clusters, which allows for fragments to only process lights that are guaranteed to contribute towards its light count results in a significant improvement in performance. 

Clustered + Deferred Shading is the fastest across all light counts. Even with 5,000 lights, the time per frame is only 57 ms, a drastic improvement over Naive Forward Shading (3,020 ms) and a (comparatively) moderate improvement over Forward+ (190 ms). 

It's clear that deferred shading offers further performance improvements, but it's clear that clustered shading makes the biggest impact here. 

<div align="center">
  <br>
  <img src="https://github.com/user-attachments/assets/ede17366-3423-467a-b4f2-81d4f88dbf19">
  <p><i>Lower is Better. Frames are rendered at 1920x1080 resolution, 16x9x24 clusters, and a 4x4x4 workgroup size.</i></p>
  <br>
</div>

#### Varying Cluster Size

Time per frame is at it's highest with "small-sized" clusters (3x3x3) at 138 ms. For "medium-sized" clusters (6x6x6 and 15x15x15), the performance improves further to 54 ms. At larger clusters (9x16x24 and 24x24x24), the performance appears to plateau at around 43 ms and reaches some point of diminishing returns. 9x16x24 appears to achieve a good balance between number of lights per clusters and the computational overhead of creating and managing the clusters. 

It's still not clear what achieves a "sweet spot". Perhaps it depends on the rendering resolution and the aspect ratio of the canvas, as implied by id Software for it's game Doom (2016). 

<div align="center">
  <br>
  <img src="https://github.com/user-attachments/assets/23476e90-7c71-4ebb-a402-8d5d2fe63ecb">
  <p><i>Lower is Better. Frames are rendered at 1920x1080 resolution, 4x4x4 workgroup size, and with 4000 lights in the scene.</i></p>
  <br>
</div>

#### Varying Workgroup Size

Surprisingly, it was found that the optimal workgroup size (for 24x24x24 clusters) appears to be around 2x2x2, with time per frame dropping to around 38 ms. Beyond this size we see performance plateau and barely change. It doesn't appear that using larger workgroup sizes beyond 2x2x2 offers any substantial benefits. 

The ratio of workgroup size to cluster size may be important here, and it may be beneficial to test workgroup sizes over different cluster configurations. Further research into how WebGPU handles occupancy for compute shaders might be insightful (although this is likely to be dependant on the DirectX 12 / Metal / Vulkan backend). 

<div align="center">
  <br>
  <img src="https://github.com/user-attachments/assets/6ab13e44-e0c8-4bfb-90d3-63323a65b028">
  <p><i>Lower is Better. Frames are rendered at 1920x1080 resolution, 24x24x24 cluster size, and with 4000 lights in the scene.</i></p>
  <br>
</div>

## Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)

These were great resources on deferred and clustered shading methods:

- [A Primer on Efficient Rendering Algorithms & Clustered Shading by Ángel Ortiz](https://www.aortiz.me/2018/12/21/CG.html)
- [DaveH355 Explanation of the blog above with more GLSL Samples](https://github.com/DaveH355/clustered-shading)
- [A WebGPU Example that implements deferred shading](https://webgpu.github.io/webgpu-samples/?sample=deferredRendering)
