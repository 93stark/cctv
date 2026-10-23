import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../providers.dart';
import 'widgets.dart';

const _categories = {
  'individual': 'Individual',
  'technician': 'CCTV Technician',
  'business_owner': 'Business Owner',
  'student': 'Student',
};

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key, required this.setup});
  final bool setup;
  @override
  ConsumerState<ProfileScreen> createState() => _ProfileState();
}

class _ProfileState extends ConsumerState<ProfileScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _location;
  late final TextEditingController _pin;
  String? _category;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final p = ref.read(authProvider).profile;
    _name = TextEditingController(text: p['fullName'] as String? ?? '');
    _location = TextEditingController(text: p['location'] as String? ?? '');
    _pin = TextEditingController(text: p['pinCode'] as String? ?? '');
    _category = p['category'] as String?;
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await ref.read(authProvider.notifier).saveProfile({
        'fullName': _name.text.trim(),
        'location': _location.text.trim(),
        'pinCode': _pin.text.trim(),
        'category': _category,
      });
      if (!widget.setup && mounted) {
        snack(context, 'Profile saved.');
        context.pop();
      }
    } catch (e) {
      if (mounted) snack(context, e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _photo() async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1024, imageQuality: 85);
    if (x == null) return;
    try {
      await ref.read(apiProvider).uploadPhoto(x.path);
      await ref.read(authProvider.notifier).refreshUser();
    } catch (e) {
      if (mounted) snack(context, e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final photo = auth.profile['photoUrl'] as String?;
    return Scaffold(
      appBar: AppBar(title: Text(widget.setup ? 'Complete your profile' : 'Edit profile'), automaticallyImplyLeading: !widget.setup),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.all(20), children: [
            if (!widget.setup)
              Center(
                child: GestureDetector(
                  onTap: _photo,
                  child: CircleAvatar(radius: 44, backgroundImage: photo != null ? NetworkImage(photo) : null, child: photo == null ? const Icon(Icons.add_a_photo) : null),
                ),
              ),
            if (widget.setup) const Padding(padding: EdgeInsets.only(bottom: 12), child: Text('Tell us a little about yourself. This helps us support you better.', style: TextStyle(color: Color(0xFF9FB2CC)))),
            const SizedBox(height: 12),
            TextFormField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Full name'), validator: (v) => (v ?? '').trim().length < 2 ? 'Enter your full name' : null),
            const SizedBox(height: 14),
            TextFormField(initialValue: auth.user?['mobile'] as String?, enabled: false, decoration: const InputDecoration(labelText: 'Mobile number')),
            const SizedBox(height: 14),
            TextFormField(controller: _location, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'City'), validator: (v) => (v ?? '').trim().length < 3 ? 'Enter your city' : null),
            const SizedBox(height: 14),
            TextFormField(controller: _pin, keyboardType: TextInputType.number, maxLength: 4, decoration: const InputDecoration(labelText: '4-digit PIN code', counterText: ''), validator: (v) => RegExp(r'^[0-9]{4}$').hasMatch((v ?? '').trim()) ? null : 'PIN code must be 4 digits'),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              value: _category,
              decoration: const InputDecoration(labelText: 'I am a'),
              items: _categories.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
              onChanged: (v) => setState(() => _category = v),
              validator: (v) => v == null ? 'Choose a category' : null,
            ),
            const SizedBox(height: 24),
            FilledButton(onPressed: _busy ? null : _save, child: Text(widget.setup ? 'Continue' : 'Save')),
          ]),
        ),
      ),
    );
  }
}
