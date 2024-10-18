@group(0) @binding(0) var<uniform> camUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;

@group(1) @binding(0) var gbufferTex: texture_2d<u32>;
@group(1) @binding(1) var gbufferTexSampler: sampler;

@group(2) @binding(0) var<storage, read> zbins: ZBinArray;
@group(2) @binding(1) var<storage, read> clusterSet : ClusterSet;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let uv = in.pos * 0.5 + 0.5;
    let gbufferVal = textureLoad(gbufferTex, vec2i(in.fragPos.xy), 0);

    let albedo = unpack4x8unorm(gbufferVal.x);
    let unpackNor = unpack2x16unorm(gbufferVal.y);
    var depth = bitcast<f32>(gbufferVal.z);

    let normal = decodeNormal(unpackNor);

    var viewPos = vec4f(in.pos, depth, 1.0);
    viewPos = camUniforms.projInv * viewPos;
    viewPos = viewPos / viewPos.w;

    let zbinIdx = floor((-viewPos.z - ${zMin}) / (${zMax} -  ${zMin}) * ${zBinSize});
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
        totalLightContrib += calculateLightContrib(light, viewPos.xyz, normal);
    }

    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1);

    //return vec4f(vec3f(-viewPos.z / 20.0), 1.0)
}

