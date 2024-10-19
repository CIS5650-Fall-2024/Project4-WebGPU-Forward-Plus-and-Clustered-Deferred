# Reference Starting Point: WebGL Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Maya Huizar
* Tested on: **Google Chrome** on MacOS Sonoma, M2

### Live Demo

[Try it yourself! No installation needed!](https://aorus1.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/)
### Demo Video/GIF

![](img/output.gif)

## Performance Analysis

This assignment has a considerable amount of performance analysis compared to implementation work. Complete the implementation early to leave time for analysis!

### Milliseconds per Frame vs. Light Count

![Milliseconds per Frame vs. Light Count](img/graph1.png)

**Settings**:
- Max Lights per Cluster: 500
- Clusters Count: 16,384

This graph compares the performance of Naive, Forward+ (Clustered), and Clustered Deferred shading methods across different light counts. Render times are measured in milliseconds per frame (ms). As the number of lights increases, Forward+ and Clustered Deferred show significant performance advantages over the naive approach.

### Milliseconds per Frame vs. Cluster Size

![Milliseconds per Frame vs. Cluster Size](img/clustercount.png)

**Settings**:
- Max Lights per Cluster: 500
- Total Lights: 1,000

This graph explores how cluster size impacts the performance of the Forward+ (Clustered) method. Varying the cluster size helps to identify optimal configurations for different rendering scenarios. Render times are provided in milliseconds per frame (ms), showing the balance between granularity and performance.

### Benefits, Trade-offs, and Optimization Insights

**Is one of them faster?**
- Forward+ (Clustered) generally performs better for moderate to high light counts, offering a good balance of performance and scalability.
- Clustered Deferred excels with complex scenes containing many lights, efficiently managing shading tasks through the G-buffer.

**Trade-offs**
- **Forward+**: Effective for dynamic lighting, but can incur overhead with high light counts and poorly distributed clusters.
- **Clustered Deferred**: Reduces redundant calculations but requires more memory, which may impact performance in bandwidth-constrained scenarios.

**Optimization Notes**
- Ensure no unnecessary copies of large structs/arrays in shaders. Use pointers in WGSL to manage this.
- Chrome's profiling tools are valuable for detecting bottlenecks in TypeScript and WGSL code.

## Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
