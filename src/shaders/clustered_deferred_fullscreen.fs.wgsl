// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(0) @binding(0) var<uniform> cu: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;

@group(1) @binding(0) var gbufferText: texture_2d<u32>;

@group(2) @binding(0) var<storage, read> zbins: ZArray;
@group(2) @binding(1) var<storage, read> cs : ClusterSet;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec2f
}

const zmin : f32 = ${zMin};
const zmax : f32 = ${zMax};
const zsize : f32 = ${zSize};
const tsize : f32 = ${tileSize};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let uv = in.pos * 0.5 + 0.5;
    let gbufferVal = textureLoad(gbufferText, vec2i(in.fragPos.xy), 0);

    let unpackNor = unpack2x16unorm(gbufferVal.y);
    let normal = normalDecode(unpackNor);
    
    var depth = bitcast<f32>(gbufferVal.z);
    var viewPos = vec4f(in.pos, depth, 1.0);
    viewPos = cu.projInv * viewPos;
    viewPos = viewPos / viewPos.w;

    let zIdx = floor((-viewPos.z - zmin) / (zmax -  zmin) * zsize);
    let zbin = zbins.arr[u32(zIdx)];
    let low = zbin & 0xFFFF;
    let high = zbin >> 16;
    
    let clusterX = floor(in.fragPos.x / tsize);
    let clusterY = floor(in.fragPos.y / tsize);
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
        totalLight += calculateLightContrib(light, viewPos.xyz, normal);
    }

    let color = unpack4x8unorm(gbufferVal.x);
    return vec4(color.rgb * totalLight, 1);
}