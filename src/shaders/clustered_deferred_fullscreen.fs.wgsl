// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var gbuffer: texture_2d<u32>;
@group(${bindGroup_scene}) @binding(4) var depthTexture: texture_depth_2d;

struct FragmentInput {
    @builtin(position) fragPos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

fn Decode(f : vec2<f32>) -> vec3<f32> {
    var f_var = f * 2.0 - 1.0;
 
    // https://twitter.com/Stubbesaurus/status/937994790553227264
    var n = vec3(f_var.x, f_var.y, 1.0 - abs(f_var.x) - abs(f_var.y));
    var t = saturate(-n.z);
    if (n.x >= 0.0 && n.y >= 0.0) {
        n.x -= t;
        n.y -= t;
    } else {
        n.x += t;
        n.y += t;
    }
    return normalize(n);
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f
{
    let texDims = textureDimensions(gbuffer);
    let texCoords = vec2u(input.fragPos.xy);
    var sample = textureLoad(gbuffer, texCoords, 0u);

    var uint_nor = unpack2x16unorm(sample.x);
    var decodedNor = Decode(uint_nor);
    var diffuseColor = unpack4x8unorm(sample.y);;

    //let sampleDepth = bitcast<f32>(sample.z);
    var sampleDepth = textureLoad(depthTexture, texCoords, 0u);
    //sampleDepth = -sampleDepth;

    var depth = bitcast<f32>(sample.z);

    let posNDCSpace = vec3<f32>(input.uv * 2.0 - 1.0, sampleDepth);
    let clipSpacePosition = vec4<f32>(posNDCSpace, 1.0);
    let worldPosH = cameraUniforms.invViewProjMat * clipSpacePosition;
    let worldSpacePos = worldPosH.xyz / worldPosH.w;

    let clusterX = u32((posNDCSpace.x + 1.0) * 0.5 * f32(${numClustersX}));
    let clusterY = u32((posNDCSpace.y + 1.0) * 0.5 * f32(${numClustersY}));
    let clusterZ = u32(f32(posNDCSpace.z) / f32(${numClustersZ}));

    let clusterIdx = u32(clusterX + ${numClustersY} * clusterY + ${numClustersY} * ${numClustersZ} * clusterZ);
    let cluster = &clusterSet.clusters[clusterIdx];

    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < cluster.numLights; lightIdx++) {
        let light = lightSet.lights[cluster.lights[lightIdx]];
        totalLightContrib += calculateLightContrib(light, worldSpacePos.xyz, decodedNor);
    }

    var finalColor = diffuseColor.xyz * totalLightContrib;
    //finalColor = vec3(input.uv, 0.0);
    //finalColor = posNDCSpace.xyz;
    //finalColor = vec3(worldSpacePos.xyz);
    //finalColor = vec3(sampleDepth, 0.0, 0.0);
    return vec4(finalColor, 1.0);
}