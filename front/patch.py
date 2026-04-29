import re

with open('/opt/gescall/front/components/CampaignDetailPage.tsx', 'r') as f:
    content = f.read()

# Extract the filters block manually using regex
match = re.search(r'(                    \{\/\* Filters Row \(Clean, unified design\) \*\/}.*?                    \}\)\n)', content, re.DOTALL)
if match:
    block = match.group(1)
    print("Found block!")
    
    # modify the class names for the bottom placement
    new_block = block.replace(
        'className="flex flex-wrap xl:flex-nowrap items-center gap-3 w-full relative z-40 pb-5 border-b border-slate-200/50"',
        'className="flex-shrink-0 flex flex-wrap xl:flex-nowrap items-center gap-3 w-full relative z-40 p-4 border-t border-slate-100 bg-white/40"'
    )
    # remove the block from its current place
    content = content.replace(block, '')
    
    # insert before footer info
    footer_pos = content.find('                        {/* Footer Info */}')
    if footer_pos != -1:
        content = content[:footer_pos] + new_block + content[footer_pos:]
        
        with open('/opt/gescall/front/components/CampaignDetailPage.tsx', 'w') as f:
            f.write(content)
        print("Success")
    else:
        print("Footer info not found")
else:
    print("Filters row block not found")
