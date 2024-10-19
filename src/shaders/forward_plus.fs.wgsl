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

@group(${bindGroup_scene}) @binding(0) var<uniform> camUnif: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTexture: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3<f32>,
    @location(1) nor: vec3<f32>,
    @location(2) uv: vec2<f32>
}

@fragment
fn main(in: FragmentInput, @builtin(position) fragCoord: vec4f) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTexture, diffuseSampler, in.uv);
    if (diffuseColor.a < 0.5) {
        discard;
    }

    let tileSize = camUnif.resolution / vec2f(${numClustersX}, ${numClustersY});

    // Get the fragment position in view space
    let posView = (camUnif.viewMat * vec4f(in.pos, 1.f)).xyz;

    // Figure out depth tile using logarithmic depth (reverse of what we did in the compute shader)
    let zTile = u32((log(abs(posView.z) / camUnif.nearFarPlane[0]) * f32(${numClustersZ})) / log(camUnif.nearFarPlane[1] / camUnif.nearFarPlane[0]));

    // Get the tile index
    let tile = vec3<u32>(vec2<u32>(fragCoord.xy / tileSize), zTile);
    let tileIndex = tile.x 
                    + (tile.y * ${numClustersX}) 
                    + (tile.z * ${numClustersX} * ${numClustersY});

    let cluster = &clusterSet.clusters[tileIndex];  

    // Do lighting calculations
    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < cluster.numLights; lightIdx++) {
        let light = lightSet.lights[cluster.lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}