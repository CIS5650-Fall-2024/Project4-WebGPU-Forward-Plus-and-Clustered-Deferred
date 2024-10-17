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
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) position : vec4<f32>,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let tile = getTile(in.position.xyz);
    
    var clusterIndex = tile.x +
         tile.y * clusterSet.numClustersX +
         tile.z * clusterSet.numClustersX * clusterSet.numClustersY;

    let cluster = clusterSet.clusters[clusterIndex];
    
    let numLightsInCluster = cluster.lightCount;
    var totalLightContrib = vec3f(0.0, 0.0, 0.0);
    for (var i = 0u; i < numLightsInCluster; i++) {
        let lightIndex = cluster.lightIndices[i];
        let light = lightSet.lights[lightIndex];

        //let lightContrib = calculateLightContrib(light, in.pos, in.nor);
        //totalLightContrib += lightContrib;
        totalLightContrib += vec3f(0.05f);
    }
    totalLightContrib += vec3f(0.1f);
    //var finalColor = diffuseColor.rgb * totalLightContrib;
    
    var finalColor = vec3f(f32(tile.x) / f32(clusterSet.numClustersX),
                           f32(tile.y) / f32(clusterSet.numClustersY),
                           f32(tile.z) / f32(clusterSet.numClustersZ));
    return vec4(finalColor, 1.0);
}

fn getTile(fragCoord : vec3<f32>) -> vec3<u32> {
  let sliceScale = f32(clusterSet.numClustersZ) / log2(cameraUniforms.farPlane / cameraUniforms.nearPlane);
  let sliceBias = -(f32(clusterSet.numClustersZ) * log2(cameraUniforms.nearPlane) / log2(cameraUniforms.farPlane / cameraUniforms.nearPlane));
  let zTile = u32(max(log2(linearDepth(fragCoord.z)) * sliceScale + sliceBias, 0.0));

  return vec3<u32>(u32(fragCoord.x / (cameraUniforms.width / f32(clusterSet.numClustersX))),
                   u32(fragCoord.y / (cameraUniforms.height / f32(clusterSet.numClustersY))),
                   zTile);
}

fn linearDepth(depthSample : f32) -> f32 {
  return cameraUniforms.farPlane * cameraUniforms.nearPlane / fma(depthSample, cameraUniforms.nearPlane - cameraUniforms.farPlane, cameraUniforms.farPlane);
}
