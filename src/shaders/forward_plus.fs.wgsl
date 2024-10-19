// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

// bindGroup_scene is 0
// bindGroup_model is 1
// bindGroup_material is 2
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f 
}

// Helper functions to viusal debug
fn hash(value: vec2f) -> f32 {
    let dotResult = dot(value, vec2f(12.9898, 78.233)); 
    let sinResult = sin(dotResult) * 43758.5453;       
    return fract(sinResult);                         
}

fn random2(input: vec2f) -> vec3f {
    let x = hash(input) * 2.0 - 1.0; // Adjust to range [-1, 1]
    let y = hash(input + vec2f(1.0, 0.0)) * 2.0 - 1.0;
    let z = hash(input + vec2f(0.0, 1.0)) * 2.0 - 1.0;
    return vec3f(x, y, z);
}

fn random1(value: u32) -> vec3f {
    let x = fract(f32(value) * 0.0001);  
    let y = fract(f32(value) * 0.0002);  
    let z = fract(f32(value) * 0.0003);  
    return vec3f(x, y, z);               
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5) {
        discard;
    }

    // Step 1: Determine which cluster the current fragment is in
    // let screenPos = (cameraUniforms.viewProjMat * vec4(in.pos, 1.0)).xyz; 
    let viewSpacePos = (cameraUniforms.viewMat * vec4(in.pos, 1.0)).xyz; // world space * view matrix = View space (camera space)
    let fragCoordZ = viewSpacePos.z; 
    var fragCoordXY = in.fragPos.xy; //cameraUniforms.viewProjMat * worldPos = fragPos --> Screen space

    // The grid size is 16 X 9 X 24
    let gridSize = vec3f(cameraUniforms.clusterX, cameraUniforms.clusterY, cameraUniforms.clusterZ);
    let tileSize = vec2f(cameraUniforms.screenWidth / f32(gridSize.x), cameraUniforms.screenHeight / f32(gridSize.y));

    let depthSlice = u32((log2(abs(fragCoordZ) / cameraUniforms.zNear)* f32(gridSize.z)) / log2(cameraUniforms.zFar / cameraUniforms.zNear));
    var tileIdx: vec3<u32> = vec3<u32>(vec2<u32>(fragCoordXY / tileSize),u32(depthSlice));
    let clusterIdx = tileIdx.x + (tileIdx.y * u32(gridSize.x)) + (tileIdx.z * u32(gridSize.x) * u32(gridSize.y));

    // Step 2: Retrieve the lights for this cluster
    // let cluster = clusterSet.clusters[clusterIdx]; // why this make me so slow?
    var totalLightContrib = vec3f(0.0, 0.0, 0.0);

    // Step 3: Accumulate light contributions from lights affecting this fragment's cluster
    for (var lightIdx = 0u; lightIdx < clusterSet.clusters[clusterIdx].numLights; lightIdx++) {
        let lightIndex = clusterSet.clusters[clusterIdx].lightIndices[lightIdx];
        let light = lightSet.lights[lightIndex];
        // Compute the light contribution for this fragment using a basic Lambertian model
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    // Step 4: Multiply the diffuse color by the accumulated light contribution
    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}