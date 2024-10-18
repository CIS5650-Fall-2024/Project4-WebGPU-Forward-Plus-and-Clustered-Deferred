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

    // compute cluster indices
    let clipPos = cameraUniforms.viewProjMat * vec4(in.pos, 1.0);
    let ndcPos = (clipPos.xyz / clipPos.w) * 0.5 + 0.5;
    let tileX = clamp(u32(ndcPos.x * f32(clusterSet.tileNumX)), 0u, clusterSet.tileNumX - 1);
    let tileY = clamp(u32(ndcPos.y * f32(clusterSet.tileNumY)), 0u, clusterSet.tileNumY - 1);

    let viewZ = -(cameraUniforms.viewMat * vec4(in.pos, 1.0)).z;
    let logZ = log(viewZ / cameraUniforms.nclip) / log(cameraUniforms.fclip / cameraUniforms.nclip);
    let tileZ = clamp(u32(logZ * f32(clusterSet.tileNumZ)), 0u, clusterSet.tileNumZ - 1);

    // get current cluster
    let clusterIdx = tileX + clusterSet.tileNumX * tileY + clusterSet.tileNumX * clusterSet.tileNumY * tileZ;
    let cluster = clusterSet.clusters[clusterIdx];
    
    // aggregate light in the cluster
    var totalLightContrib = vec3f(0, 0, 0);
    for (var idx = 0u; idx < cluster.numLights; idx++) {
        let lightIdx = cluster.lightInx[idx];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);

    // return vec4(f32(tileX) / f32(clusterSet.tileNumX), f32(tileY) / f32(clusterSet.tileNumY), f32(tileZ) / f32(clusterSet.tileNumZ), 1.0);
    // return vec4(f32(clusterIdx) / f32(clusterSet.tileNum), f32(clusterIdx) / f32(clusterSet.tileNum), f32(clusterIdx) / f32(clusterSet.tileNum), 1.0);
}
