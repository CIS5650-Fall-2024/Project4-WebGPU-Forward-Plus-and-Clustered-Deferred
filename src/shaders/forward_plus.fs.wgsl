@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> clusterUniforms: ClusterUniforms;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

fn zIndexFromZ(z: f32) -> u32 {
    // Equation from eq. 3 in http://www.aortiz.me/2018/12/21/CG.html#forward-shading,
    return u32((clusterUniforms.clusterDims.z * log(z / camera.near) ) / camera.logFarOverNear);
}

@fragment
fn main(
    @builtin(position) fragCoord: vec4<f32>,
    in: FragmentInput
) -> @location(0) vec4f
{

    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let viewPos = camera.viewMat * vec4(in.pos, 1.0);
    let clusterX = u32((fragCoord.x / camera.screenDims.x) * clusterUniforms.clusterDims.x);
    // Note: WebGPU convention is that the origin is at the top-left corner of the screen
    // https://gpuweb.github.io/gpuweb/wgsl/#position-builtin-value
    let clusterY = u32(((camera.screenDims.y - fragCoord.y) / camera.screenDims.y) * clusterUniforms.clusterDims.y);
    let clusterZ = zIndexFromZ(-viewPos.z);

    let globalClusterIndex = clusterX
                           + (clusterY * u32(clusterUniforms.clusterDims.x))
                           + (clusterZ * u32(clusterUniforms.clusterDims.x * clusterUniforms.clusterDims.y));

    // Retrieve the cluster data for the current fragment
    let clusterLightCount = clusterSet.clusters[globalClusterIndex].lightCount;

    var totalLightContrib = vec3f(0.0);
    for (var lightIdx = 0u; lightIdx < clusterLightCount; lightIdx++) {
        let light = lightSet.lights[clusterSet.clusters[globalClusterIndex].lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1.0);
}
