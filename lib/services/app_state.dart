import 'package:flutter/foundation.dart';

class GuardianModel {
  final String name;
  final String phone;

  GuardianModel({required this.name, required this.phone});
}

class AppState extends ChangeNotifier {
  static final AppState instance = AppState._internal();
  factory AppState() => instance;
  AppState._internal() {
    _guardians.addAll([
      GuardianModel(name: 'Malarvizhi', phone: '9500238347'),
      GuardianModel(name: 'Jegatheesan', phone: '8754842755'),
    ]);
  }

  String name = '';
  String phone = '';
  String address1 = '';
  String address2 = '';
  bool isGuest = false;

  final List<GuardianModel> _guardians = [];

  List<GuardianModel> get rawGuardians => List.unmodifiable(_guardians);

  List<GuardianModel> get guardians =>
      isGuest ? const [] : List.unmodifiable(_guardians);

  void setGuestMode(bool guest) {
    isGuest = guest;
    notifyListeners();
  }

  void toggleGuestMode() {
    isGuest = !isGuest;
    notifyListeners();
  }

  void addGuardian(String name, String phone) {
    _guardians.add(GuardianModel(name: name, phone: phone));
    notifyListeners();
  }

  void removeGuardian(int index) {
    if (index >= 0 && index < _guardians.length) {
      _guardians.removeAt(index);
      notifyListeners();
    }
  }

  void setGuardians(List<GuardianModel> list) {
    _guardians.clear();
    _guardians.addAll(list);
    notifyListeners();
  }

  void updateProfile({
    String? newName,
    String? newPhone,
    String? newAddress1,
    String? newAddress2,
    List<GuardianModel>? newGuardians,
  }) {
    if (newName != null && newName.isNotEmpty) name = newName;
    if (newPhone != null && newPhone.isNotEmpty) phone = newPhone;
    if (newAddress1 != null && newAddress1.isNotEmpty) address1 = newAddress1;
    if (newAddress2 != null && newAddress2.isNotEmpty) address2 = newAddress2;
    if (newGuardians != null && newGuardians.isNotEmpty) {
      _guardians.clear();
      _guardians.addAll(newGuardians);
    }
    isGuest = false;
    notifyListeners();
  }
}

