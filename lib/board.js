import {config,database,statsForDays,easternDay} from './server.js';
export async function getBoard(before,selectedUsername,viewer) {
    const c=config();
    const users=await database('checkpoint_users?select=username,display_name&order=created_at.asc');
    const selected=users.find(user=>user.username===selectedUsername)||users.find(user=>user.username===viewer?.username)||users.find(user=>user.username===c.username)||users[0]||{username:c.username,display_name:c.displayName};
    const q=new URLSearchParams({select:'id,username,message,created_at,post_day',username:`eq.${selected.username}`,order:'created_at.desc,id.desc',limit:'51'});
    if(before){
      before=String(before);
      let decoded;try{decoded=JSON.parse(Buffer.from(before,'base64url').toString())}catch{throw Object.assign(new Error('Invalid page cursor.'),{status:400})}
      if(!decoded||typeof decoded!=='object'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|\+00:00)$/.test(decoded.time)||!/^[0-9a-f-]{36}$/i.test(decoded.id))throw Object.assign(new Error('Invalid page cursor.'),{status:400});
      q.set('or',`(created_at.lt.${decoded.time},and(created_at.eq.${decoded.time},id.lt.${decoded.id}))`);
    }
    const posts=await database('checkpoint_posts?'+q);
    const days=[];
    for(let offset=0;;offset+=1000){
      const rows=await database('checkpoint_days?'+new URLSearchParams({select:'post_day',username:`eq.${selected.username}`,order:'post_day.asc',limit:'1000',offset:String(offset)}));
      days.push(...rows.map(r=>r.post_day));if(rows.length<1000)break;
    }
    const page=posts.slice(0,50),now=new Date();
    return {posts:page,next:posts.length>50?Buffer.from(JSON.stringify({time:page.at(-1).created_at,id:page.at(-1).id})).toString('base64url'):null,stats:statsForDays(days,now),displayName:selected.display_name,selectedUsername:selected.username,users,currentUser:viewer,today:easternDay(now)};
}
