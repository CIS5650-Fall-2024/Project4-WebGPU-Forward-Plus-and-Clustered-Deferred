WebGL Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Christine Kneer
  * https://www.linkedin.com/in/christine-kneer/
  * https://www.christinekneer.com/
* Tested on: **Google Chrome 129.0.6668.101** on
  Windows 11, i7-13700HX @ 2.1GHz 32GB, RTX 4060 8GB (Personal Laptop)

## Part 1: Introduction

In this project, I implemented a WebGPU renderer that is capable of using Naive, Forward Plus, and Deferred Shading.

[Live Demo](https://jiaomama.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/)

https://github.com/user-attachments/assets/0a094b92-2fed-4b76-b869-90b9b7a7e9ee


### Part 1.1: Naive Shading

**Naive Shading** refers to a traditional forward shading pipeline, where the entire shading process occurs in a single rendering pass using both a vertex and fragment shader.

- **Vertex Shader**: In this stage, each vertex of a triangle is processed, including its attributes such as position, normal, and UV coordinates.
- **Fragment Shader**: For each fragment, the fragment shader computes the shading by iterating over **all the lights** in the scene.

This approach, while straightforward, can become inefficient with a large number of lights, as each fragment requires a computation for every light, regardless of whether the light significantly affects that fragment.

### Part 1.2: Forward Plus Shading

**Forward Plus Shading** optimizes the Naive Shading by dividing the view frustrum into clusters, allowing each fragment to only iterate over **lights within its respective cluster**. 

In my implementation, I chose to use **exponentional division scheme**. This approach divides the depth axis non-linearly, with smaller clusters near the camera and larger clusters farther away.

|![division](https://github.com/user-attachments/assets/c3a3946d-ef6e-4be0-b60d-be942d82aeb6)|
|:--:|
|Exponentional Division Scheme, Credit: https://github.com/DaveH355/clustered-shading|

This results in fewer divisions covering the same area. This would generally increase performance becuase fewer lights will be assigned to the smaller clusters closer to the camera, where objects cover more pixels and thus involve more fragment computation. 

Below is a visualization of the clusters in our scene. Each shade of color represents a different cluster.

|![overall](https://github.com/user-attachments/assets/720d9fc7-7d85-4d62-b265-e3a33e56ddb9)|![x](https://github.com/user-attachments/assets/f756648e-c97d-4419-bbfe-7734c44863b7)|![y](https://github.com/user-attachments/assets/f5e8024e-7da5-4acb-815f-b0d80413f65c)|![z](https://github.com/user-attachments/assets/12d1d057-81d3-4b3b-a018-5a64c36045d0)|
|:--:|:--:|:--:|:--:|
|*XYZ Direction*|*X Direction*|*Y Direction*|*Z Direction*|

We assign lights to each cluster by checking for intersection of the cluster AABB with the light sphere.

<p align="center">
<img width="611" alt="image" src="https://github.com/user-attachments/assets/6e04d743-b3f9-4bd7-b18d-382f29393206">
</p>

The entire shading process still occurs in a single rendering pass, but with an additional compute shader that is in charge of clustering.
- **Compute Shader**: This shader processes all clusters in the scene, determining which lights fall within each cluster based on their positions and influence(radius).
- **Vertex Shader**: Same as naive.
- **Fragment Shader**: For each fragment, we first determine which cluster it belongs to. Then, instead of iterating through all lights in the scene, the fragment shader only considers the lights assigned to its specific cluster, significantly reducing the number of light calculations and improving performance.

### Part 1.3: Deferred Shading

In Forward Plus Shading, we still spend time computing lighting for fragments that may not be visible on the screen (fragments that are occluded by others). **Deferred Shading** addresses this inefficiency by only applying the expensive lighting calculations to visible fragments.

Deferred Shading works by splitting the rendering process into two passes:

- **Geometry Pass (G-buffer Pass)**: In the first pass, we render the scene’s geometry and store essential data such as albedo, normals, and depth into multiple textures. No lighting is applied at this stage.

|![albedo](https://github.com/user-attachments/assets/e6ddeb61-dbb6-49d4-b64b-06de1acb157a)|![normal](https://github.com/user-attachments/assets/67eb0ee4-38c6-43e8-9a10-0d6045d48b1b)|![depth](https://github.com/user-attachments/assets/cf2787c5-6a6f-4cd8-b14c-58c3fe080dd2)|
|:--:|:--:|:--:|
|*Albedo*|*Normal*|*Depth (scaled to fit in the red channel)*|

- **Lighting Pass (Full-Screen Quad Pass)**: In the second pass, a full-screen quad is rendered, and the lighting calculations are performed only for the visible fragments. By sampling from the G-buffer, we have all the necessary information (albedo, normals, depth) to compute lighting. And we follow the same logic as Forward Plus: first determine belonging cluster, then iterate through lights in cluster. Since this pass operates on a per-pixel basis and only for visible pixels, it avoids the overhead of unnecessary lighting computations for occluded fragments.

## Part 2: Performance Analysis

As discussed in Part 1, **Naive Shading** is the most inefficient. **Forward Plus Shading** optimizes Naive Shading by reducing the number of lights to check per fragment. Finally, **Deferred Shading** optmizes upon Forward Plus by not spending time caclulating occluded fragments' lighting. 

Our tests support the above theoretical comparison. In fact, Naive Shading basically fails to refresh once number of lights exceed 1000. Below is a side by side comparison of Forward Plus vs Deferred Shading's runtime on number of lights. Lower run time (in ms) is beter.

***Note:** Somehow when tested on my desktop computer I am seeing **SIGNIFICANT** performance boost compared to my laptop. I suspect this could still be due to underlying hardware differences or perhaps most likely incorrect browser setting on my laptop (my laptop has a better GPU than my laptop). Due to the fact that I discovered this last minute, I couldn't investigate further, but I've decided to include both results here. Both results show similar overall trend, however.*

|![chart (1)](https://github.com/user-attachments/assets/e07e5b8d-8499-4c03-b430-30aaaa5cd232)|
|:--:|
|*Desktop: clusterWorkgroupSize: [4, 4, 4], clusterDim: [16, 9, 24], maxLightsPerCluster: 500*|

Desktop Spec: Windows 11, 11th Gen Intel(R) Core(TM) i7-11700KF @ 3.60GHz, RTX 3070, Chrome: 129.0.6668.101

|![chart (1)](https://github.com/user-attachments/assets/0323b57b-3e8f-446e-8cc0-8075409f31ad)|
|:--:|
|*Laptop: clusterWorkgroupSize: [4, 4, 4], clusterDim: [16, 9, 24], maxLightsPerCluster: 500*|

Laptop spec: Windows 11, i7-13700HX @ 2.1GHz 32GB, RTX 4060 8GB (Personal Laptop), Chrome: 129.0.6668.101

As we can see from the graph, Deferred Shading is obviously the fastest. While Forward Plus is much faster than Naive, performance significantly degrades as number of lights in the scene increases. This is because we spend time computing lighting for fragments that may not be visible on the screen. On the other hand, Deferred Shading also experience performance drop as number of lights increases - which is understandable since computation is proprotional to number of lights - but overall has much better performance.

Due to limited time and resources, we were not able to test multiple scenes, but theoretically Forward Plus could outperform Deferred when the objects in the scene is sparse. In that case, few or even no fragments will be occluded, meaning that writing to G-Buffer would actually become an overhead. Overall, the tradeoff between Forward Plus and Deferred lies in memory usage and overhead of GBuffer vs occluded fragments. If we may have many occluded segments (for example in complex scenes), it would be better to avoid the extra cost by using GBuffer sampling.

Below is another graph comparing different cluster dimensions.

![chart (3)](https://github.com/user-attachments/assets/040378b6-78a4-4e5f-9af4-ef1171528deb)
|:--:|
|*clusterWorkgroupSize: [4, 4, 4], maxLightsPerCluster: 500, # of Lights: 500*|

For both Forward Plus & Defered, decreasing the number of clusters per axis would slow down performance. This is expected since fewer clusters result in more lights per cluster, thus increasing the computational load per fragment. However, note that Defered Shading's drop in performance is much less significant than that of Forward Plus, likely due to limiting the computation only to visible fragments.

### Credits
- Understanding the spatial transformations involved in clustered shading:
    - https://github.com/DaveH355/clustered-shading
- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
