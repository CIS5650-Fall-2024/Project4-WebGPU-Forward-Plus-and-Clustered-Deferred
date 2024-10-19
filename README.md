WebGL Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Yifan Lu
  * [LinkedIn](https://www.linkedin.com/in/yifan-lu-495559231/), [personal website](http://portfolio.samielouse.icu/index.php/category/featured/)
* Tested on: Windows 11, AMD Ryzen 7 5800H 3.20 GHz, Nvidia GeForce RTX 3060 Laptop GPU (Personal Laptop)
  
![](/img/defer.gif)

### Live Demo

To run the live demo, make sure you are using a web explorer that supports WebGPU!

[CLICK ME TO SEE THE LIVE DEMO!](https://lyifaxxx.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/)

### Demo Video/GIF

[![](img/video.mp4)](TODO)
<p float="center">
  <img src="/img/navie.gif" width="25%" />
  <img src="/img/f+.gif" width="25%" />
  <img src="/img/defer.gif" width="25%" />
</p>

From left to right: Navie, Forward-plus clustered, Deferred-clustered

### Introduction
This project is based on WebGPU that featured in using 3 rendering techniques to render a scene with a large number of point lights. WebGPU has its advantage as every viewer with a compatiable web explorer and graphics adoptor can view the content without extra work.

The three rendering techniques are:
#### Navie
Navie is a simple forward rendering pass with only one vertex shader that processes the scene info and one fragment shader that does the shading based on the info passed from the vertex shader and uniforms. All the shadings are done in the fragment shader where we loop through each light and shade every fragment.

#### Forward+ Clustered
To avoid unneccessary lighting, we can divide the camera view space into several clusters that each stores the lighting info in a compute shader, and then use the cluster info to do the shading in fragment shader later.

The following picture shows the tiles in different colors. In this project, the dimension for the clusters are 16 * 16 * 16. This means in camera's view space, there are 16 cuts in each direction (x, y, z).

![](/img/tiles.png)

We usually do not care about objects that are far away from the camera, which means it will be a waste to compute light info in clusters that have a high z-tile index. And since there is a limit in the number of lights a cluster can hold, if we divide the clusters in z-direction in a small number, many lights will not functional during shading. To avoid this artifact we can divide the slices in z-direction exponentially so that more slices will be in front of the camera.

#### Deferred Clustered
We can further avoid shading occuluded fragments by adding a pre-pass that stores the frame info into serveral textures that are called G-Buffers. Then we launch a second pass to shade based on these G-Buffers.  In this project, G-Buffers are used to store albedo, normal and depth info.

### Performance Analysis
#### Comparison between Naive, Forward+ Clustered and Deferred Clustered
The Navie implement has a time complexity as ```O(N*M)```, ```N = #lights``` and ```M = #objects```. After introducing the cluster structure to Navie, we do not need to loop through each light, instead, we get the cluster's index from fragment and only shade the fragment with the lights inside the cluster. The time complexity for forward+ deferred is reduced to ```O(P*Q)```, with ```P = #total clusters``` and ```Q = #lights in a cluster```. In deferred clustered shading, we only have to check clusters that the frame texture contains. The time complexity further reduced to ```O(R*S)```, with ```R = #clusters for this frame``` and ```S = #lights in a cluster```.

The term "reduced to" in above section is not true in some cases. If the total number of lights in the scene is small, the performance gap between these three will not be significant.

The following graph shows the timing in milliseconds for each three implements with change in number of lights:
![](/img/numLights.png)


With a relatively small number of lights (below 500 in this case), the timing for simple forward (navie) and forward-plus do not differ much. After the 500 point, timing for navie continues growing as the number of lights increases. For forward-plus and deffered, the timing plateaus as the number of lights in each cluster reaches its limits, 500 in this implement.

Deferred-cluster does not suffers much from change of light numbers. Since the camera's position and angle is fixed when we testing with number of lights, the clusters involved in the second fragment shader are fixed in each test case. The only element that will effect the timing will be the increasing number of lights in each of these clusters, which does not have a huge impact on the calculation.

The default camera setting has a large depth range that will include more clusters for forward-plus case. If the total slice number in the z-direction is 32, there will be 9 slices in the default view space:

![](/img/slices.png)

We can adjust the camera to face a wall, reducing the slices in z-direction. The performance for forward and forward-plus will have a boost as the following graph shows:

![](/img/facingWall.png)
![](/img/facingWall_2.png)

The Navie implememnt also has an increased performance because the number of objects reduces when camera is facing the wall.

The timing for deferred doesn't change much. The change of number of useful clusters in deferred in much less than the forward-plus.


##### Trade-offs
With the above disscussion, we can safely draw the conclusion that for a large number of lights, the overall performance ranges: deferred-cluster > forward-plus cluster > forward(navie).

For both two cluster-based implements, we sacrifice the time to compute the cluster-light information and memory to store them for a faster shading. With small light numbers, the cluster-structure does not improve performance overall. The number of clusters will also effect the timing and memory. The graph below shows the timing for forward-plus and deferred with different cluster settings under the total 500 lights and 16 slices.


![](/img/tileSize.png)


#### Optimization in Forward+ Clustered and Deferred Clustered

My WebGPU limits are listed below:
![image](https://github.com/user-attachments/assets/f6cb2900-4c75-4eca-9e6e-73eae45c154e)

The max number for compute groups is 64k, which means if we are using one dimension workgroups, our cluster's dimension cannot exceed the combination of 64*32*32 (2^16). To avoid this issue I changed the workgroup call to be 3-dimension. This will not change the frame rate in general but allows us to divide the view space into more clusters which means more light.

Copying large structures to function may cause bottleneck, so I used pointers to copy them in compute shader code. However, the performance for forward-plus and deferred do not show an improvement. The bottleneck is not in copying the structures.



### Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
