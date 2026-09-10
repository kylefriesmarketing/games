"""The House: authored den soft furnishings and arcade joinery.

Run Blender -b -P tools/blender/build-den.py -- <games-hub> <work-directory>
Uses the existing couch's UVs and silhouette. Builds a fitted knitted throw,
bakes a gentle corduroy normal map, and exports two matching arcade chassis
with explicit screen/marquee sockets and a one-shot start-button animation.
All dimensions are metres; G(x,height,depth) converts the game's Y-up coordinates.
"""
import bpy, sys, os, math, json
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT, WORK = [os.path.abspath(p) for p in sys.argv[sys.argv.index('--')+1:]]
OUT = os.path.join(ROOT, 'assets', 'props', 'house')
os.makedirs(WORK, exist_ok=True)
G = lambda x,y,z: (x,-z,y)

def material(name, color, rough=.7, metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    return m

def cube(name, loc, dims, mat, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=G(*loc))
    o=bpy.context.object; o.name=name; o.dimensions=(dims[0],dims[2],dims[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if bevel:
        m=o.modifiers.new('soft routed edges','BEVEL');m.width=bevel;m.segments=3
        bpy.ops.object.modifier_apply(modifier=m.name)
    for p in o.data.polygons:p.use_smooth=True
    m=o.modifiers.new('weighted face normals','WEIGHTED_NORMAL');m.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=m.name)
    return o

def tube(name, points, radius, mat, cyclic=False):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=1
    c.bevel_depth=radius;c.bevel_resolution=2
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    s.use_cyclic_u=cyclic
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.convert(target='MESH');o.select_set(False)
    return o

def export(name, animations=False):
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        if o.type in {'MESH','EMPTY'}:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',
        use_selection=True,export_animations=animations,export_extras=True,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6)
    tris=sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')
    print('DEN_ASSET',json.dumps({'name':name,'polygons':tris,'bytes':os.path.getsize(os.path.join(OUT,name+'.glb'))}))

def image(name, rgba):
    h,w,_=rgba.shape
    im=bpy.data.images.new(name,width=w,height=h,alpha=True)
    im.pixels.foreach_set(rgba.astype(np.float32).ravel())
    im.filepath_raw=os.path.join(WORK,name+'.png');im.file_format='PNG';im.save()
    return im

def sofa():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,'dencouch.glb'))
    o=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    o.name='DenCorduroy'
    # Apply precisely the browser's previous fit: turn, width 2.05, floor zero.
    for v in o.data.vertices:v.co=o.matrix_world @ v.co
    o.matrix_world=Matrix.Identity(4)
    for v in o.data.vertices:v.co=Matrix.Rotation(math.pi,4,'Z')@v.co
    pts=[v.co for v in o.data.vertices]
    mn=Vector(tuple(min(p[i] for p in pts) for i in range(3)))
    mx=Vector(tuple(max(p[i] for p in pts) for i in range(3)))
    scale=2.05/(mx.x-mn.x);center=(mn+mx)*.5
    for v in o.data.vertices:v.co=(v.co-Vector((center.x,center.y,mn.z)))*scale
    bpy.context.view_layer.update()
    # Bake fabric normals onto the EXISTING UV atlas. Actual surface detail,
    # independent of the photographed diffuse; very shallow so it remains cloth.
    m=o.data.materials[0];m.name='Den corduroy - brushed cocoa';nt=m.node_tree;p=nt.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value=.92
    tex=nt.nodes.new('ShaderNodeTexCoord');wave=nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type='BANDS';wave.bands_direction='X';wave.inputs['Scale'].default_value=125
    wave.inputs['Distortion'].default_value=.8
    nt.links.new(tex.outputs['Generated'],wave.inputs['Vector'])
    bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.25;bump.inputs['Distance'].default_value=.002
    nt.links.new(wave.outputs['Color'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],p.inputs['Normal'])
    im=bpy.data.images.new('den-corduroy-normal',width=1024,height=1024,alpha=False)
    im.colorspace_settings.name='Non-Color'
    target=nt.nodes.new('ShaderNodeTexImage');target.image=im;nt.nodes.active=target
    bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=8
    bpy.context.scene.render.bake.margin=8
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.bake(type='NORMAL')
    im.filepath_raw=os.path.join(WORK,'den-corduroy-normal.png');im.file_format='PNG';im.save()
    nt.nodes.remove(bump);nt.nodes.remove(wave);nt.nodes.remove(tex)
    normal=nt.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.6
    nt.links.new(target.outputs['Color'],normal.inputs['Color']);nt.links.new(normal.outputs['Normal'],p.inputs['Normal'])
    # Sample the real cushion/back surface so the throw cannot hover above it.
    deps=bpy.context.evaluated_depsgraph_get();bvh=BVHTree.FromObject(o,deps)
    def height(x,y):
        hit=bvh.ray_cast(Vector((x,y,2)),Vector((0,0,-1)))
        return hit[0].z if hit[0] else None
    print('DRAPE_PROFILE',[(round(y,3),height(-.48,y)) for y in np.linspace(-.4,.48,15)])
    # Smoothed hand-laid profile follows the back, the seat and the front drop.
    ny,nx=86,48;vertices=[];uvs=[]
    for j in range(ny+1):
        t=j/ny;y=-.37+t*.86
        for i in range(nx+1):
            u=i/nx;x=-.80+u*.76+.018*math.sin(t*7)
            h=height(x,min(y,.43))
            if y>.425:
                h0=height(x,.417) or .39
                z=h0-(h0-.13)*min(1,(y-.425)/.065)
            else:
                # Highest neighbouring samples gently bridge creases, never cut
                # through the fabric or pull the surface inside the upholstery.
                hs=[height(x,y+dy) for dy in [-.012,0,.012]]
                z=max([v for v in hs if v is not None] or [.70])
            fold=.009+.012*(.35+.65*t)*math.sin(u*math.pi*8+t*2)**2
            front_y=y
            if y>.40:
                face=bvh.ray_cast(Vector((x,2,z+fold)),Vector((0,-1,0)))
                if face[0]:front_y=max(y,face[0].y+.014)
            vertices.append((x,front_y,z+fold));uvs.append((u,t))
    faces=[]
    for j in range(ny):
        for i in range(nx):
            a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
    me=bpy.data.meshes.new('fitted afghan surface');me.from_pydata(vertices,[],faces);me.update()
    throw=bpy.data.objects.new('DenAfghan',me);bpy.context.collection.objects.link(throw)
    uv=me.uv_layers.new(name='Weave')
    for poly in me.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:uv.data[li].uv=uvs[me.loops[li].vertex_index]
    n=512;yy,xx=np.mgrid[0:n,0:n]/n
    # Large tartan crossings with finer over-under yarn structure, not noisy grit.
    red=np.array([.63,.27,.18]);gold=np.array([.86,.70,.43]);teal=np.array([.18,.29,.27])
    color=np.zeros((n,n,3));color[:]=red
    band=((xx*7)%1<.20)|((yy*8)%1<.20);color[band]=teal
    stripe=((xx*7)%1<.057)|((yy*8)%1<.057);color[stripe]=gold
    thread=.87+.08*np.sin(xx*n*math.pi)*np.sin(yy*n*math.pi)+.05*np.sin((xx+yy)*256*math.pi)
    color*=thread[:,:,None]
    rgba=np.concatenate((color,np.ones((n,n,1))),axis=2)
    pattern=image('den-afghan-tartan',rgba)
    wool=material('Afghan wool - tintable tartan',(1,1,1),.97)
    wp=wool.node_tree.nodes.get('Principled BSDF');tn=wool.node_tree.nodes.new('ShaderNodeTexImage');tn.image=pattern
    wool.node_tree.links.new(tn.outputs['Color'],wp.inputs['Base Color']);throw.data.materials.append(wool)
    # A finished blanket has a bound edge and loose tassels; both follow its drape.
    hem=material('Afghan binding',(.63,.42,.21),.95)
    border=[vertices[i] for i in range(nx+1)]+[vertices[j*(nx+1)+nx] for j in range(1,ny+1)]+[vertices[ny*(nx+1)+i] for i in range(nx-1,-1,-1)]+[vertices[j*(nx+1)] for j in range(ny-1,0,-1)]
    edging=tube('DenAfghanHem',border,.0032,hem,True);edging.parent=throw
    tassels=[]
    for i in range(1,nx,2):
        x,y,z=vertices[ny*(nx+1)+i]
        pts=[(x+.002*math.sin(k*1.7+i),y+.006*k,z-.009*k) for k in range(6)]
        tassels.append(tube('tassel',pts,.0018,hem))
    bpy.ops.object.select_all(action='DESELECT')
    for a in tassels:a.select_set(True)
    bpy.context.view_layer.objects.active=tassels[0];bpy.ops.object.join();bpy.context.object.name='DenAfghanFringe';bpy.context.object.parent=throw
    export('den-sofa')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK,'den-sofa.blend'))

def cabinet(key,accent):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    dark=material('satin charcoal laminate',(.025,.029,.038),.57)
    black=material('recessed graphite',(.008,.011,.016),.72)
    trim=material('coloured T-moulding',accent,.4)
    metal=material('brushed coin plate',(.18,.20,.22),.38,.65)
    ivory=material('start button ivory',(.83,.79,.64),.38)
    # Routed side panels: a single intentional profile, extruded in Blender.
    outline=[(-.34,.07),(.36,.07),(.36,.73),(.41,.83),(.40,.91),(.175,.995),(.067,1.345),(.28,1.405),(.28,1.62),(-.34,1.62)]
    for side in [-1,1]:
        vs=[G(x,y,z) for x in [side*.338,side*.364] for z,y in outline]
        n=len(outline);fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        me=bpy.data.meshes.new('routed side');me.from_pydata(vs,[],fs);me.update()
        ob=bpy.data.objects.new('CabinetSide',me);bpy.context.collection.objects.link(ob);ob.data.materials.append(dark)
        bpy.context.view_layer.objects.active=ob;ob.select_set(True)
        b=ob.modifiers.new('small rounded arris','BEVEL');b.width=.006;b.segments=3;bpy.ops.object.modifier_apply(modifier=b.name);ob.select_set(False)
        tube('T_moulding',[G(side*.367,y,z) for z,y in outline],.006,trim,True)
        # Three side stripes: worn arcade-era graphic vocabulary, readable obliquely.
        for j in range(3):
            stripe=cube('Side accent', (side*.369,.42+j*.085,-.08),(.002,.024,.43),trim,.001)
    cube('Back panel',(0,.835,-.325),(.65,1.55,.035),dark)
    cube('Kick plinth',(0,.045,.015),(.66,.09,.62),black)
    cube('Front apron',(0,.435,.328),(.65,.69,.045),dark)
    cube('Apron band',(0,.72,.355),(.65,.024,.018),trim,.004)
    cube('Coin door',(0,.41,.357),(.255,.27,.022),metal,.008)
    for x in [-.078,.078]:
        cube('Coin slot',(x,.465,.371),(.038,.008,.008),black,.002)
        cube('Coin return',(x,.345,.374),(.045,.033,.014),black,.004)
    # Exact mounting plane for the monitor: local XY, rotated back 17 degrees.
    # Its socket is exported with the chassis; the browser attaches live cover art.
    tilt=-.29;center=Vector(G(0,1.165,.118))
    rot=Matrix.Rotation(math.pi/2+tilt,4,'X')
    def mount_cube(name,x,y,w,h,mat,depth=.02):
        ob=cube(name,(0,0,0),(w,depth,h),mat,.006)
        # cube's local axes x/y are width/height before this rotation.
        ob.rotation_euler=(math.pi/2+tilt,0,0)
        ob.location=center+rot.to_3x3()@Vector((x,y,0))
        return ob
    # plane normal = (0,-cos(tilt),-sin(tilt)) in Blender; into the room.
    for x in [-.291,.291]:mount_cube('Monitor cheek',x,0,.065,.414,black,.045)
    for y in [-.193,.193]:mount_cube('Monitor lip',0,y,.52,.035,black,.045)
    # A shallow back plate hides the body behind the animated glass.
    mount_cube('Monitor dark well',0,0,.57,.385,black,.012)
    def socket(name,loc,rotation=(0,0,0)):
        o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=G(*loc);o.rotation_euler=rotation
        return o
    socket('ScreenSocket',(0,1.165,.126),(math.pi/2+tilt,0,0))
    cube('Marquee surround',(0,1.505,.244),(.65,.20,.075),black,.01)
    for yy in [1.411,1.598]:cube('Marquee trim',(0,yy,.286),(.65,.012,.013),trim,.003)
    socket('MarqueeSocket',(0,1.505,.286),(math.pi/2,0,0))
    # Control deck slopes gently toward the player.
    deck=cube('Control deck',(0,.879,.275),(.65,.055,.29),black,.013)
    deck.rotation_euler.x=-.18
    cube('Deck nose',(0,.835,.412),(.65,.028,.026),trim,.009)
    def button(name,x,y,z,r,mat):
        bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=r,depth=.011,location=G(x,y,z))
        o=bpy.context.object;o.name=name;o.data.materials.append(mat)
        b=o.modifiers.new('button rolled lip','BEVEL');b.width=.003;b.segments=2;bpy.ops.object.modifier_apply(modifier=b.name)
        for p in o.data.polygons:p.use_smooth=True
        return o
    button('Joystick boot',-.20,.922,.275,.039,black)
    cube('Joystick stem',(-.20,.95,.275),(.011,.065,.011),metal,.003)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.03,location=G(-.20,.986,.275));bpy.context.object.name='JoystickBall';bpy.context.object.data.materials.append(trim)
    for i in range(6):button('Action button',.055+(i%3)*.067,.926+(i//3)*.01,.325-(i//3)*.063,.021,trim if i%3!=2 else ivory)
    start=button('StartButton',-.07,.94,.20,.016,ivory)
    home=start.location.z
    for frame,d in [(1,0),(7,-.006),(13,-.006),(22,0)]:
        start.location.z=home+d;start.keyframe_insert(data_path='location',frame=frame)
    start.animation_data.action.name='press_start'
    bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=22;bpy.context.scene.render.fps=30;bpy.context.scene.frame_set(1)
    # Bolt heads on the monitor cheeks: tiny material details with restrained cost.
    for x in [-.293,.293]:
        for y in [-.155,.155]:
            ob=mount_cube('Bezel screw',x,y,.008,.008,metal,.005)
            ob.location += rot.to_3x3()@Vector((0,0,.026))
    # Batch static geometry by material; preserve the animated button and sockets.
    for mat in [dark,black,trim,metal,ivory]:
        obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o!=start and o.data.materials and o.data.materials[0]==mat]
        if len(obs)>1:
            bpy.ops.object.select_all(action='DESELECT')
            for ob in obs: ob.select_set(True)
            bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();bpy.context.object.name='Cabinet_'+mat.name
    export(key,True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK,key+'.blend'))

sofa()
cabinet('den-arcade-rift',(.48,.025,.045))
cabinet('den-arcade-issue',(.80,.48,.055))
print('DEN_BUILD_COMPLETE')
