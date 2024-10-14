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

    let clipPos = cameraUniforms.viewProjMat * vec4(in.pos, 1.0);
    let ndc = clipPos.xyz / clipPos.w;
    let ndcXY01 = ndc.xy * 0.5 + 0.5;
    let epsilon = 0.0001;
    let ndcX = clamp(ndcXY01.x, 0.0, 1.0 - epsilon);
    let ndcY = clamp(ndcXY01.y, 0.0, 1.0 - epsilon);
    let clusterX = u32(floor(ndcX * f32(clusterSet.numClustersX)));
    let clusterY = u32(floor(ndcY * f32(clusterSet.numClustersY)));

    let viewPos = cameraUniforms.viewProjMat * vec4(in.pos, 1.0);
    let viewZ = -viewPos.z; 
    let zNear = cameraUniforms.nearPlane;
    let zFar = cameraUniforms.farPlane;
    let clusterSizeZ = (zFar - zNear) / f32(clusterSet.numClustersZ);
    var clusterZ = u32(floor((viewZ - zNear) / clusterSizeZ));
    clusterZ = clamp(clusterZ, 0u, clusterSet.numClustersZ - 1u);

    var clusterIndex = clusterX + 
                       clusterY * clusterSet.numClustersX + 
                       clusterZ * clusterSet.numClustersX * clusterSet.numClustersY;

    let maxClusterIndex = clusterSet.numClustersX * clusterSet.numClustersY * clusterSet.numClustersZ - 1u;
    clusterIndex = clamp(clusterIndex,0, maxClusterIndex);
    let cluster = clusterSet.clusters[clusterIndex];

    let numLightsInCluster = cluster.lightCount;
    var totalLightContrib = vec3f(0.0, 0.0, 0.0);
    for (var i = 0u; i < numLightsInCluster; i++) {
        let lightIndex = cluster.lightIndices[i];
        let light = lightSet.lights[lightIndex];

        let lightContrib = calculateLightContrib(light, in.pos, in.nor);
        totalLightContrib += lightContrib;
        //totalLightContrib += vec3f(0.01f);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1.0);
}