// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

// Read from the G-buffer instead of the material
@group(1) @binding(0) var normalTex: texture_2d<f32>;
@group(1) @binding(1) var albedoTex: texture_2d<f32>;
@group(1) @binding(2) var positionTex: texture_2d<f32>;
@group(1) @binding(3) var bufferSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2<f32>,
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    // The UVs are flipped somehow
    let flippedUV = vec2<f32>(in.uv.x, 1.0 - in.uv.y);

    let normal = textureSample(normalTex, bufferSampler, flippedUV); // texture, sampler, uvcoord
    let albedo = textureSample(albedoTex, bufferSampler, flippedUV);
    let position = textureSample(positionTex, bufferSampler, flippedUV);

    // Step 1: Determine which cluster the current fragment is in
    let screenPos = (cameraUniforms.viewProjMat * vec4(position.xyz, 1.0)).xyz; 
    let viewSpacePos = (cameraUniforms.viewMat * vec4(position.xyz, 1.0)).xyz;
    let fragCoordZ = viewSpacePos.z;
    var fragCoordXY = in.fragPos.xy;

    // The grid size is 16 X 9 X 24
    let gridSize = vec3f(cameraUniforms.clusterX, cameraUniforms.clusterY, cameraUniforms.clusterZ);
    let tileSize = vec2f(cameraUniforms.screenWidth / f32(gridSize.x), cameraUniforms.screenHeight / f32(gridSize.y));

    let depthSlice = u32((log2(abs(fragCoordZ) / cameraUniforms.zNear)* f32(gridSize.z)) / log2(cameraUniforms.zFar / cameraUniforms.zNear));
    var tileIdx: vec3<u32> = vec3<u32>(vec2<u32>(fragCoordXY / tileSize),u32(depthSlice));
    let clusterIdx = tileIdx.x + (tileIdx.y * u32(gridSize.x)) + (tileIdx.z * u32(gridSize.x) * u32(gridSize.y));

    // Step 2: Retrieve the lights for this cluster
    var totalLightContrib = vec3f(0.0, 0.0, 0.0);

     // Step 3: Accumulate light contributions from lights affecting this fragment's cluster
    for (var lightIdx = 0u; lightIdx <  clusterSet.clusters[clusterIdx].numLights; lightIdx++) {
        let lightIndex =  clusterSet.clusters[clusterIdx].lightIndices[lightIdx];
        let light = lightSet.lights[lightIndex];
        // Compute the light contribution for this fragment using a basic Lambertian model
        totalLightContrib += calculateLightContrib(light, position.xyz, normal.xyz);
    }
    
    // Step 4: Multiply the diffuse color by the accumulated light contribution
    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}


