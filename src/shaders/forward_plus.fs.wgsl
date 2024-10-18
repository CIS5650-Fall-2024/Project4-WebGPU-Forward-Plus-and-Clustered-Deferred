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

@group(0) @binding(1) var<storage, read> lightSet: LightSet;

@group(2) @binding(0) var diffuseTex: texture_2d<f32>;
@group(2) @binding(1) var diffuseTexSampler: sampler;

@group(3) @binding(0) var<storage, read> zarr: ZArray;
@group(3) @binding(1) var<storage, read> cs : ClusterSet;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let color = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (color.a < 0.5) {
        discard;
    }
    var zmin : f32 = ${zMin};
    var zmax : f32 = ${zMax};
    var zsize : f32 = ${zSize};
    let zidx = floor((-in.pos.z - zmin) / (zmax -  zmin) * zsize);
    let zbin = zarr.arr[u32(zidx)];
    let low = zbin & 0xFFFF;
    let high = zbin >> 16;
    
    let clusterX = floor(in.fragPos.x / f32(${tileSize}));
    let clusterY = floor(in.fragPos.y / f32(${tileSize}));
    let clusterIdx = u32(clusterX) + u32(clusterY) * cs.width;
    let lightNum = cs.clusters[clusterIdx].lights[${maxLightsPerTile} - 1];

    var totalLight = vec3f(0, 0, 0);
    for (var i = 0u; i < lightNum; i++) {
        let idx = cs.clusters[clusterIdx].lights[i];
        if (idx < low) {
            continue;
        } else if (idx >= high) {
            break;
        }
        let light = lightSet.lights[idx];
        totalLight += calculateLightContrib(light, in.pos, in.nor);
    }
    return vec4(color.rgb * totalLight, 1);
}
