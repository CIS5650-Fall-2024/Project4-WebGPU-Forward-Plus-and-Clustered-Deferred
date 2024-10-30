WebGL Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Nadine Adnane
  * [LinkedIn](https://www.linkedin.com/in/nadnane/)
* Tested on my personal laptop (ASUS ROG Zephyrus M16):
* **OS:** Windows 11
* **Processor:** 12th Gen Intel(R) Core(TM) i9-12900H, 2500 Mhz, 14 Core(s), 20 Logical Processor(s) 
* **GPU:** NVIDIA GeForce RTX 3070 Ti Laptop GPU

### Sneak Peek 👀

[![](img/thumb.png)](http://TODO.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred)

### Introduction

In this project, I implemented two advanced rendering technques - Forward+ Shading and Clustered Deferred Shading - as an exploration of WebGPU. WebGPU is an API which exposes the capabilities of GPU hardware for applications on the web, allowing for much faster runtimes of graphical computations. The Sponza atrium model and a large number of point lights serve as the basis of our scene, with a GUI menu to toggle between the different rendering modes.

## Naive Renderer (Forward Rendering)
For each fragment, the naive implementation involves checking against every light in the scene, which end up being just as slow as it sounds! This means that for example, if we have a cube in our scene, the algorithm will check against every light in the scene for every cube in the pixel - extremely slow and unecessary! By doing this, we are checking lights for fragments which will be overwritten anyways - essentially wasting a lot of work for no reason. This method certainly gets the job done in a pinch, but we can do better :)

## Forward+
The forward implementation optimizes the naive implementation by only checking the lights in the cluster that the current fragment is in.
This way, we are only checking lights that actually affect the current fragment, plus or minus a little wiggle room.

Clusters: portions of the 3D space that correspond with the tiles on 2D screen
3D space -> 2D space involves perspective transform
Clusters in 3D are bounding frustums, and are aligned with the camera, not the scene!
When you move the camera, the bounding frustums move in world space
Compute shader - calculates the bounds of the clusters in screen space (2D), then calculate starting and ending depth, convert screen depth bounds to view-space coordinates

Assign lights to clusters, keep track of how many lights are in this cluster up to a hard-coded max num of lights
For each light, check if it intersects with the cluster's bounding box, if it does, add it to the cluster
BUT still suffers from the problem of overdraw - you are drawing fragments behind that are going to get overwritten anyway, so you're wasting a lot of work anyway!

## Clustered Deferred
Deferred Shading
Draw each object in the scene to G-buffers (which include the albedo, normal, position)
So initial rendering pass is really simple because you're just outputing to a texture and then later on read from those textures to do the final rendering
This way, there's only one fragment for each pixel as opposed to multiple if you have a scene with a lot of depth
Light clustering is pretty much exactly the same as Forward+ - you can use the same exact compute shaders
We can reconstruct the world position from the depth buffer
With just those 3 textures (diffuse color, depth, and normal buffers), you can render the entire scene

### Live Demo

[![](img/thumb.png)](http://nadnane.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred)

### Demo Video/GIF

[![](img/video.mp4)](TODO)

### Performance Analysis
Comparison of Forward+ and Clustered Deferred Shading
- Which one is faster?
- Is one of them better at certain types of workloads?
- What are the benefits and tradeoffs of using one over the other?
- For any performance differences, explain potential causes.

### Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
