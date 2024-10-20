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
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage,read_write> clusterSet: ClusterSet;
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
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

    let view_space = camera.viewProjMat * vec4(in.pos,1.0); 
    //Determine cluster using AABB0

    var tile_id = vec3(u32(floor(((view_space.x/view_space.z)*0.5 + 0.5)*f32(${tilesize[0]}))), u32(floor(((view_space.y/view_space.z)*0.5+0.5)*f32(${tilesize[1]}))), 0);
    let clusterPosX = u32(floor(((view_space.xy / view_space.z).x * 0.5 + 0.5) * f32(${tilesize[0]})));
    let clusterPosY = u32(floor(((view_space.xy / view_space.z).y * 0.5 + 0.5) * f32(${tilesize[1]})));
    let clusterPosZ = u32(floor((-view_space.z - ${nearPlane}) / (${farPlane} - ${nearPlane}) * f32(${tilesize[2]})));

    let cluster_index = (clusterPosX + clusterPosY * ${tilesize[0]} + clusterPosZ * ${tilesize[0]} * ${tilesize[1]});


    let cluster = clusterSet.clusters[cluster_index];

    var totalLightContrib = vec3f(0, 0, 0);

    for (var lightIdx = 0u; lightIdx < cluster.numLights; lightIdx++) {
        let light = lightSet.lights[cluster.lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;

    return vec4(finalColor, 1);
}

