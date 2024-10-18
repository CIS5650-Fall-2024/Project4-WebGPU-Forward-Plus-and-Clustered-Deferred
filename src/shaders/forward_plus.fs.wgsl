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

@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

@group(${bindGroup_lightCluster}) @binding(0) var<storage, read> zbins: ZBinArray;
@group(${bindGroup_lightCluster}) @binding(1) var<storage, read> clusterSet : ClusterSet;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

fn findLightLowerBound(lowerBound: f32) -> u32 {

    var low = 0u;
    var high = lightSet.numLights;
    var mid = 0u;

    while (low < high) {
        mid = (low + high) / 2u;
        if (lowerBound <= lightSet.lights[mid].pos.z) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }
    return low;
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5) {
        discard;
    }

    let zbinIdx = floor((-in.pos.z - ${zMin}) / (${zMax} -  ${zMin}) * ${zBinSize});
    let zbin = zbins.bins[u32(zbinIdx)];
    let low = zbin & 0xFFFF;
    let high = zbin >> 16;
    var totalLightContrib = vec3f(0, 0, 0);

    let clusterX = floor(in.fragPos.x / f32(${tileSize}));
    let clusterY = floor(in.fragPos.y / f32(${tileSize}));
    let clusterIdx = u32(clusterX) + u32(clusterY) * clusterSet.width;
    let lightNum = clusterSet.clusters[clusterIdx].lights[${maxLightsPerTile} - 1];

    for (var i = 0u; i < lightNum; i++) {
        let lightIdx = clusterSet.clusters[clusterIdx].lights[i];
        if (lightIdx < low) {
            continue;
        } else if (lightIdx >= high) {
            break;
        }
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    //var tmp = vec3f(-in.pos.z) / 20.f;
    return vec4(finalColor, 1);
}
