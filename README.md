WebGL Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Zhaojin Sun
  * www.linkedin.com/in/zjsun
* Tested on: Windows 11, i9-13900HX @ 2.2GHz 64GB, RTX 4090 Laptop 16GB

### Live Demo

[Free free to look around!](https://zjsun1017.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/)

### Demo Video/GIF

![5000.gif](img%2F5000.gif)
Although the instructions require at least thirty seconds, this GIF is only ten seconds long; otherwise, it would be too large to upload to GitHub! However, there's no noticeable difference between the ten-second and thirty-second versions.

### 1. Project Overview
This project is about learning to use WebGPU and implementing some accelerated rendering methods. The project is very challenging for me because I didn’t have any prior experience with JavaScript, and the design concepts of WebGPU are very different from CUDA. Particularly, the complex Binding Group and the many built-in pipelines make it hard for someone with limited experience like me to adapt. That said, the overall content of this project is still very interesting, especially as faster methods are implemented, the increase in frame rate becomes quite noticeable.

**Features implemented**
- Naive Forward Rendering
- Clustered Forward Plus Rendering
- Clustered Deferred Rendering
- [Extra Credit +5] Clustered Deferred Rendering with Compact G-Buffer

### 2. Features and Performance Analysis
#### (i) Speed Comparison among All rendering Methods
The image below shows the speed performance of three different rendering methods under various numbers of light sources. I set the maximum number of lights per cluster to 500 and divided the space into 16 * 12 * 100 clusters. This is a rather rough test. Some more detailed analysis will be conducted below.
![FPS.png](img%2FFPS.png)

It is clear that with a large number of light sources, naive rendering performs the worst because it does not filter the lights in any way, so generally its speed decreases linearly with respect to the number of lights. 

The clustered forward+ method optimizes light selection by rendering at most 500 lights per cluster, based on their proximity to the light sources, instead of rendering all 5000 lights. This results in several times the performance improvement. However, since clustered forward+ precomputes the clusters using a compute shader, it incurs some overhead, and when the number of light sources is small, its speed can be slower than the naive method. 

For deferred shading, due to the presence of the G-buffer, each pixel only retains the cluster with the smallest depth, which minimizes redundant rendering. As a result, its performance is faster and can remain stable at 50 FPS even with 5000 light sources.

#### (ii) Clustered Forward Plus Rendering
When implementing clustered forward+, the first problem I encountered was depth slicing. Initially, I used linear slicing between the near and far planes, but this did not work well because, according to the projection relationship, clusters should become longer as they get farther away. Therefore, I used exponential interpolation with the following formula to achieve better depth division. During this process, I encountered a bunch of strange coordinate transformation errors, most of which were related to homogeneous transformations of depth. One issue, in particular, was that the depth was along the negative axis, which took me several hours to discover.

[Blooper time! Wait......? As for problems mentioned above, there has been some really amazing bloopers, but I can't reproduce them anymore >:(]

The second problem I encountered was that some clusters were not rendered correctly, causing a lot of visual glitches on the screen like the blooper below. This issue was equally frustrating, and I only discovered later that it was due to a misconfiguration of the block settings, which resulted in certain clusters not being assigned any computational threads. I still haven't fully figured out how WebGPU allocates threads, but from this experience, it seems that WebGPU's thread scheduling is not as clear and refined as CUDA's, although it might also be due to my lack of experience.
![Blooper2.gif](img%2FBlooper2.gif)

The third problem was even more mysterious. When the depth slicing was insufficient, max number of lights per cluster is very small, and the near clip plane and far clip plane were not chosen appropriately, a blooper like the one below occurred. Although the resolution of the GIF isn't very high, it should be quite obvious from the floor that there is a disconnection between different clusters and tiles, causing a noticeable blocky effect on the screen.To address this issue, I increased the depth slices to 100.
![Blooper3.gif](img%2FBlooper3.gif)

Reducing the maximum number of lights per cluster can improve the speed of the Clustered Forward+ render. The figure below shows the curve of per-frame processing time as the maximum number of lights changes, with the number of clusters remaining at 16 * 12 * 100.
![Lights_per_cluster.png](img%2FLights_per_cluster.png)

As I mentioned earlier, to eliminate the blocky visual effect, I increased the depth slices to 100. However, after testing, increasing the slices did not cause a noticeable performance drop, unlike increasing the number of lights each cluster can handle. This can be explained by the fact that the additional slices can be processed in parallel, while the lights within each cluster still need to be processed sequentially in a loop.

#### (iv) Clustered Deferred Rendering
In Deferred Rendering, I initially stored all three G-buffers as 32-bit floats (totaling 12 bytes), but since color attachments only support up to 32 bytes, I changed all three G-buffers to 16-bit floats, which totaled 6 bytes, making them fit. However, due to the reduced precision of depth in the G-buffer, a blocky effect appeared as shown in the image below. As a result, I had to change the position G-buffer back to 32-bit.
![Blooper4.gif](img%2FBlooper4.gif)

Coordinate transformations are still a very troublesome issue, especially since the vertex information that can be processed inside the pipeline is quite flexible. This means that even a small mistake can lead to incorrect outputs in the wrong coordinate system, as shown in the image below.
![Blooper5.gif](img%2FBlooper5.gif)

#### (iv) [Extra Credits] Compact G-Buffer
When compressing the G-buffer into a 4-byte array, I used the octahedron normal encoding method to compress the three-element normal into two elements, as per the instructions. However, due to time constraints, the encode and decode processes were not well optimized, leading to many if-else conditions, which caused warp divergence and impacted performance. As shown in the image below, after compressing the G-buffer, the actual speed even slowed down. (FPS is still being used here instead of milliseconds.)
![compact.png](img%2Fcompact.png)






### Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
