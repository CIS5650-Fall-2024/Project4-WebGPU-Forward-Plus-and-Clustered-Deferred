WebGPU Forward+ and Clustered Deferred Shading - Instructions
==========================================================

**This is due Friday, October 18th at 11:59 PM.**

In this project, you will implement the Forward+ and Clustered Deferred shading methods as discussed in class. You are given a scene with the Sponza atrium model and a large number of point lights, as well as a GUI to toggle between the different rendering modes.

## Contents
- `src/` contains all the TypeScript and WGSL code for this project. This contains several subdirectories:
  - `renderers/` defines the different renderers in which you will implement Forward+ and Clustered Deferred shading
  - `shaders/` contains the WGSL files that are interpreted as shader programs at runtime, as well as a `shaders.ts` file which preprocesses the shaders
  - `stage/` includes camera controls, scene loading, and lights, where you will implement the clustering compute shader
- `scenes/` contains the Sponza Atrium model used in the test scene

## Running the code

Follow these steps to install and view the project:
- Clone this repository
- Download and install [Node.js](https://nodejs.org/en/)
- Run `npm install` in the root directory of this project to download and install dependencies
- Run `npm dev`, which will open the project in your browser
  - The project will automatically reload when you edit any of the files

Note that the project will **not** work immediately after being cloned and set up as there are some tasks for you to complete to get it up and running (see [the project instructions](#part-1-implement-the-different-rendering-methods)).

This project requires a WebGPU-capable browser. Ensure that you can see the Sponza scene being renderered using this [WebGPU test](https://toji.github.io/webgpu-test/). Google Chrome seems to work best on all platforms. If you have problems running the starter code, use Chrome and make sure you have updated your browser and video drivers.

### GitHub Pages setup

Since this project uses WebGPU, it is easy to deploy it on the web for anyone to see. To set this up, do the following:
- Go to your repository's settings
- Go to the "Pages" tab
- Under "Build and Deployment", set "Source" to "GitHub Actions"

Once you've done that, any new commit to the `main` branch should automatically deploy to the URL `<username>.github.io/<repo_name>`.

## Requirements
**Ask on Ed Discussion for any clarifications.**

In this project, you are given code for:
- glTF scene loading
- Camera control
- Light movement compute shader
- Naive forward renderer
- Skeleton code for Forward+ and Clustered Deferred renderers
- Helpers

For editing the project, you will want to use [Visual Studio Code](https://code.visualstudio.com/). Once you've installed VSCode, you can open the root folder of this project using "File > Open Folder..." to start coding. You may also find [this extension](https://marketplace.visualstudio.com/items?itemName=PolyMeilex.wgsl) useful for highlighting WGSL syntax.

WebGPU errors will appear in your browser's developer console (Ctrl + Shift + J for Chrome on Windows). Unlike some other graphics APIs, WebGPU error messages are often very helpful, especially if you've labeled your various pipeline components with meaningful names. Be sure to check the console whenever something isn't working correctly.

### Part 1: Implement the different rendering methods

To start off, the naive renderer is missing a camera view projection matrix buffer, and your job is to fill in the missing parts. This will expose you to various parts of the codebase and will hopefully help you understand the general layout of the WebGPU rendering pipeline.

#### 1) Naive

1.1) Create and write to the buffer
- You first need to create the buffer in `camera.ts` and write the view projection matrix to it
- Then, you need to upload the buffer to the GPU
- Look for comments containing `TODO-1.1` for details

1.2) Use the buffer in a bind group and a render pass
- You then need to use the buffer in the naive renderer's layouts and pipeline
- Look for comments containing `TODO-1.2` for details

1.3) Update the shaders accordingly
- Lastly, you need to update the naive renderer shaders to actually use the new buffer
- Look for comments containing `TODO-1.3` for details

Then, based on the discussions in lecture and recitation, you are expected to implement the Forward+ and Clustered Deferred rendering methods and analyze their results. Here is a summary of both methods:

#### 2) Forward+

  - Build a data structure to keep track of how many lights are in each cluster and what their indices are
  - Render each fragment using only the lights that overlap its cluster
  - Look for comments containing `TODO-2` for details

When adding new buffers, especially if they contain new structs, their alignment might be different than what you expect. Be sure to check your structs' alignment using [this online calculator](https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#) and match the memory layout on the host.

#### 3) Clustered Deferred

  - Reuse the clustering logic from Forward+
  - Store vertex attributes in a G-buffer
  - Read from the G-buffer in a separate fullscreen pass to produce final output
  - Look for comments containing `TODO-3` for details

### Part 2: Effects and Optimizations

#### Effects

Choose one of the following effects to implement. (Or do multiple for extra credit!)
- Implement deferred Blinn-Phong shading (diffuse + specular) for point lights
- Implement one of the following post-processing effects:
  - Bloom using post-process blur (box or Gaussian)
  - Toon shading (with ramp shading + simple depth-edge detection for outlines)

#### Optimizations

Optimize the G-buffer used for the Clustered Deferred renderer. In particular, aim to reduce the amount of textures and the size of per-pixel data. Some ideas to get you started:
- Pack values together into `vec4`s
- Use 2-component normals
  - For even more compression, look into octahedron normal encoding, which can even be packed into one `u32`
- Quantize values by packing them into smaller data types
- Reduce number of properties passed via the G-buffer
  - For example, reconstruct world space position using camera matrices and depth

For full credit, you must show a good optimization effort and record the performance of each version you test.

## Performance Analysis

Compare your implementations of Forward+ and Clustered Deferred shading and analyze their differences.
- Is one of them faster?
- Is one of them better at certain types of workloads?
- What are the benefits and tradeoffs of using one over the other?
- For any differences in performance, briefly explain what may be causing the difference.

Optimize your TypeScript and/or WGSL code. Chrome's profiling tools are useful for this. For each change that improves performance, show the before and after render times.

If your Forward+ or Clustered Deferred renderer is running much slower than expected, make sure you are not making copies of large structs/arrays in shader code. You can use [pointers](https://google.github.io/tour-of-wgsl/types/pointers/using/) in WGSL to avoid this issue.

For each new effect feature (required or extra), please provide the following analysis:
  - Concise overview and explanation of the feature.
  - Performance change due to adding the feature.
  - If applicable, how do parameters (such as number of lights, number of tiles, etc.) affect performance? Show data with graphs.
    - Show timing in milliseconds, not FPS.
  - If you did something to accelerate the feature, what did you do and why?
  - How might this feature be optimized beyond your current implementation?

For each performance feature (required or extra), please provide:
  - Concise overview and explanation of the feature.
  - Detailed performance improvement analysis of adding the feature.
    - What is the best case scenario for your performance improvement? What is the worst? Explain briefly.
    - Are there tradeoffs to this performance feature? Explain briefly.
    - How do parameters (such as number of lights, number of tiles, etc.) affect performance? Show data with graphs.
      - Show timing in milliseconds, not FPS.
    - Show debug views when possible.
      - If the debug view correlates with performance, explain how.

## Base Code Walkthrough

In general, you can search for comments containing "CHECKITOUT" to see the most important/useful parts of the base code.

- `src/main.ts` initializes WebGPU, various shared entities (lights, camera, scene, etc.), and the renderer itself. You likely won't have to change this file unless you want to edit the GUI.
- `src/stage/` contains all the classes that deal with the information in a stage.
  - `src/stage/camera.ts` contains camera controls. You will need to add new uniform buffers here for certain camera matrices for the Forward+ and Deferred Clustered renderers.
  - `src/stage/lights.ts` controls the lights' positions and color. This is where you will call the light clustering compute shader.
  - `src/stage/scene.ts` loads glTF scene files. You won't need to edit this file unless you want to load scenes other than the provided Sponza scene.
  - `src/stage/stage.ts` combines the above three entities into one class for ease of use.
- `src/renderer.ts` is the base `Renderer` class that all renderers extend from. The bulk of the logic you need to write will go in the subclasses, so you won't need to edit this file.
- `src/renderers/` contains the subclasses of `Renderer`. The file names are self-explanatory. This is where most of the new host-side logic will be written.
- `src/shaders/` contains all the WGSL shaders.
  - `src/shaders/shaders.ts` loads and preprocesses the WGSL shader files. You can add constants here that can be directly referenced in shaders, similar to preprocessor defines in C++.
  - `src/shaders/common.wgsl` contains some shader utility functions that are prepended to all shaders. Code used by multiple shaders should go here if possible.
- `src/math_utils.ts` contains a few math helper functions. Feel free to add more.

## README

Replace the contents of `README.md` with the following:
- A brief description of your project and the specific features you implemented
- At least one screenshot of your project running
- A 30+ second video/gif of your project running showing all features (even though your demo can be seen online, it may not run on all computers, while a video will work everywhere)
- A link to your project's live website (see [GitHub Pages setup](#github-pages-setup))
- Performance analysis (see [above](#performance-analysis))

## Submit

Open a GitHub pull request so that we can see that you have finished. The title should be "Project 4: YOUR NAME". The template of the comment section of your pull request is attached below, you can do some copy and paste:

- Repo Link
- Briefly mention features that you've completed, especially those bells and whistles you want to highlight:
  - Feature 0
  - Feature 1
  - ...
- Feedback on the project itself, if any.

### Third-Party Code Policy

- Use of any third-party code must be approved by asking on Ed Discussion.
- If it is approved, all students are welcome to use it. Generally, we approve use of third-party code that is not a core part of the project. For example, for the path tracer, we would approve using a third-party library for loading models, but would not approve copying and pasting a CUDA function for doing refraction.
- Third-party code **MUST** be credited in README.md.
- Using third-party code without its approval, including using another student's code, is an academic integrity violation, and will, at minimum, result in you receiving an F for the semester.